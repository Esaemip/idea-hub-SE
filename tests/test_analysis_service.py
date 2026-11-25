import tempfile
import unittest
from pathlib import Path
from contextlib import closing

from backend.database import connect, initialize_database
from backend.analysis_service import InvalidAnalysis, StaleAnalysis, run_analysis


class AnalysisServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / 'test.sqlite3'
        initialize_database(self.db)
        with closing(connect(self.db)) as db, db:
            db.execute("INSERT INTO boards (id, title) VALUES (1, '보드')")
            db.execute("INSERT INTO groups (id, board_id, name, name_is_manual) VALUES (10, 1, '직접 정한 이름', 1)")
            db.execute("INSERT INTO ideas (id, board_id, text, group_id, assignment_is_manual) VALUES (1, 1, '수동 카드', 10, 1)")
            db.execute("INSERT INTO ideas (id, board_id, text) VALUES (2, 1, '새 카드 1'), (3, 1, '새 카드 2'), (4, 1, '새 카드 3')")

    def state(self):
        with closing(connect(self.db)) as db:
            return (list(map(tuple, db.execute('SELECT * FROM groups ORDER BY id'))),
                    list(map(tuple, db.execute('SELECT * FROM ideas ORDER BY id'))))

    def test_applies_new_cards_and_preserves_existing_manual_changes(self):
        def fake(request):
            self.assertEqual(request['target_idea_ids'], [2, 3, 4])
            self.assertTrue(request['groups'][0]['name_is_manual'])
            return {'board_id': 1, 'groups': [
                {'group_id': 10, 'name': '무시해야 할 이름', 'idea_ids': [2]},
                {'group_id': None, 'name': '새 그룹', 'idea_ids': [3]}],
                'unclassified_idea_ids': [4]}
        self.assertEqual(run_analysis(self.db, 1, fake), 3)
        with closing(connect(self.db)) as db:
            groups = list(db.execute('SELECT id, name, name_is_manual FROM groups ORDER BY id'))
            ideas = list(db.execute('SELECT id, group_id, assignment_is_manual, analyzed_at FROM ideas ORDER BY id'))
        self.assertEqual(tuple(groups[0]), (10, '직접 정한 이름', 1))
        self.assertEqual(tuple(ideas[0])[:3], (1, 10, 1))
        self.assertEqual(ideas[1]['group_id'], 10)
        self.assertEqual(ideas[2]['group_id'], groups[1]['id'])
        self.assertIsNone(ideas[3]['group_id'])
        self.assertTrue(all(row['analyzed_at'] for row in ideas[1:]))
        self.assertEqual(run_analysis(self.db, 1, lambda _: self.fail('대상이 없으면 호출하지 않아야 함')), 0)

    def test_invalid_results_leave_everything_unchanged(self):
        results = [
            {'board_id': 1, 'groups': [], 'unclassified_idea_ids': [2, 2, 4]},
            {'board_id': 1, 'groups': [{'group_id': 999, 'name': 'x', 'idea_ids': [2]}], 'unclassified_idea_ids': [3, 4]},
            {'board_id': 1, 'groups': [{'group_id': None, 'name': ' ', 'idea_ids': [2]}], 'unclassified_idea_ids': [3, 4]},
            {'board_id': 1, 'groups': [], 'unclassified_idea_ids': [1, 2, 3, 4]},
            {'board_id': 2, 'groups': [], 'unclassified_idea_ids': [2, 3, 4]},
        ]
        before = self.state()
        for result in results:
            with self.subTest(result=result), self.assertRaises(InvalidAnalysis):
                run_analysis(self.db, 1, lambda _, result=result: result)
            self.assertEqual(self.state(), before)

    def test_analyzer_failure_does_not_change_board(self):
        before = self.state()
        def fail(_):
            raise RuntimeError('AI 오류')
        with self.assertRaises(RuntimeError):
            run_analysis(self.db, 1, fail)
        self.assertEqual(self.state(), before)

    def test_changes_during_analysis_are_not_overwritten(self):
        def fake(_):
            with closing(connect(self.db)) as db, db:
                db.execute("UPDATE ideas SET text = '분석 중 수정' WHERE id = 2")
            return {'board_id': 1, 'groups': [], 'unclassified_idea_ids': [2, 3, 4]}
        with self.assertRaises(StaleAnalysis):
            run_analysis(self.db, 1, fake)
        with closing(connect(self.db)) as db:
            row = db.execute('SELECT text, analyzed_at FROM ideas WHERE id = 2').fetchone()
            self.assertEqual(tuple(row), ('분석 중 수정', None))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM groups').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
