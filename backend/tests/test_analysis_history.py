from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import sqlite3
import unittest

from backend.analysis_service import InvalidAnalysis, StaleAnalysis, run_analysis
from backend.database import connect, initialize_database


class AnalysisHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'test.sqlite3'
        initialize_database(self.path)
        with closing(connect(self.path)) as db, db:
            db.execute("INSERT INTO boards (id, title) VALUES (1, '회의')")
            db.execute("INSERT INTO ideas (id, board_id, text) VALUES (1, 1, '카드1'), (2, 1, '카드2')")

    def history(self):
        with closing(connect(self.path)) as db:
            return [dict(row) for row in db.execute('SELECT * FROM analysis_results ORDER BY id')]

    def test_running_then_completed_and_no_op_does_not_add_history(self):
        def analyzer(request):
            running = self.history()[0]
            self.assertEqual((running['status'], running['target_count']), ('running', 2))
            self.assertIsNone(running['completed_at'])
            return {'board_id': request['board_id'],
                    'groups': [{'group_id': None, 'name': '새 그룹', 'idea_ids': [1, 2]}],
                    'unclassified_idea_ids': []}
        self.assertEqual(run_analysis(self.path, 1, analyzer), 2)
        record = self.history()[0]
        self.assertEqual((record['status'], record['target_count']), ('completed', 2))
        self.assertIsNotNone(record['completed_at'])
        self.assertIsNone(record['error_message'])
        self.assertEqual(run_analysis(self.path, 1, lambda _: self.fail('대상이 없어 모델 실행 불필요')), 0)
        self.assertEqual(len(self.history()), 1)
        with closing(connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM ideas WHERE group_id IS NOT NULL AND analyzed_at IS NOT NULL').fetchone()[0], 2)

    def test_failures_preserve_board_and_record_safe_message(self):
        def model_error(_):
            raise RuntimeError('카드 내용이나 개인 경로 같은 민감한 오류')
        cases = [(model_error, RuntimeError, '분석 처리 중 오류가 발생했습니다'),
                 (lambda _: {'board_id': 1, 'groups': [], 'unclassified_idea_ids': [1]},
                  InvalidAnalysis, 'AI 분석 결과가 계약에 맞지 않습니다')]
        for analyzer, error, message in cases:
            with self.subTest(error=error), self.assertRaises(error):
                run_analysis(self.path, 1, analyzer)
            self.assertEqual(self.history()[-1]['status'], 'failed')
            self.assertEqual(self.history()[-1]['error_message'], message)
            self.assertIsNotNone(self.history()[-1]['completed_at'])
        with closing(connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM groups').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM ideas WHERE analyzed_at IS NOT NULL').fetchone()[0], 0)

    def test_user_edit_during_analysis_is_preserved_and_failure_recorded(self):
        def analyzer(_):
            with closing(connect(self.path)) as db, db:
                db.execute("UPDATE ideas SET text = '사용자 수정' WHERE id = 1")
            return {'board_id': 1, 'groups': [], 'unclassified_idea_ids': [1, 2]}
        with self.assertRaises(StaleAnalysis):
            run_analysis(self.path, 1, analyzer)
        self.assertEqual(self.history()[0]['status'], 'failed')
        with closing(connect(self.path)) as db:
            self.assertEqual(tuple(db.execute('SELECT text, analyzed_at FROM ideas WHERE id = 1').fetchone()), ('사용자 수정', None))

    def test_failed_database_write_rolls_back_group_and_ideas(self):
        with closing(connect(self.path)) as db, db:
            db.execute("CREATE TRIGGER test_abort BEFORE UPDATE ON ideas BEGIN SELECT RAISE(ABORT, 'failure'); END")
        result = {'board_id': 1, 'groups': [{'group_id': None, 'name': '새 그룹', 'idea_ids': [1, 2]}], 'unclassified_idea_ids': []}
        with self.assertRaises(sqlite3.IntegrityError):
            run_analysis(self.path, 1, lambda _: result)
        self.assertEqual(self.history()[0]['status'], 'failed')
        with closing(connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM groups').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM ideas WHERE analyzed_at IS NOT NULL').fetchone()[0], 0)

    def test_missing_board_has_no_history(self):
        with self.assertRaises(ValueError):
            run_analysis(self.path, 999, lambda _: None)
        self.assertEqual(self.history(), [])


if __name__ == '__main__':
    unittest.main()
