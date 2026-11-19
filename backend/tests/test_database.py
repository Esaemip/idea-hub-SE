from contextlib import closing
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

from backend.database import connect, initialize_database


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "test.sqlite3"
        initialize_database(self.path)
        self.db = connect(self.path)
        self.addCleanup(self.db.close)

    def test_data_persists_and_initialization_is_repeatable(self):
        self.db.execute("INSERT INTO boards (title) VALUES (?)", ("회의",))
        self.db.commit()
        initialize_database(self.path)
        with closing(connect(self.path)) as reopened:
            self.assertEqual(reopened.execute("SELECT title FROM boards").fetchone()[0], "회의")

    def test_group_must_belong_to_same_board(self):
        self.db.execute("INSERT INTO boards (title) VALUES ('A'), ('B')")
        self.db.execute("INSERT INTO groups (board_id, name) VALUES (1, '계정')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO ideas (board_id, group_id, text) VALUES (2, 1, '아이디어')")

    def test_group_delete_keeps_idea_but_board_delete_removes_it(self):
        self.db.execute("INSERT INTO boards (title) VALUES ('A')")
        self.db.execute("INSERT INTO groups (board_id, name) VALUES (1, '계정')")
        self.db.execute("INSERT INTO ideas (board_id, group_id, text) VALUES (1, 1, '로그인')")
        self.db.execute("DELETE FROM groups WHERE id = 1")
        idea = self.db.execute("SELECT group_id, assignment_is_manual FROM ideas").fetchone()
        self.assertEqual((idea[0], idea[1]), (None, 1))
        self.db.execute("DELETE FROM boards WHERE id = 1")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ideas").fetchone()[0], 0)

    def test_default_state_and_empty_text_validation(self):
        self.db.execute("INSERT INTO boards (title) VALUES ('A')")
        self.db.execute("INSERT INTO ideas (board_id, text) VALUES (1, '아이디어')")
        idea = self.db.execute("SELECT group_id, assignment_is_manual, analyzed_at, created_at FROM ideas").fetchone()
        self.assertEqual((idea[0], idea[1], idea[2]), (None, 0, None))
        self.assertTrue(idea[3].endswith('Z'))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO ideas (board_id, text) VALUES (1, '   ')")

    def test_analysis_history_lifecycle_and_board_deletion(self):
        self.db.execute("INSERT INTO boards (title) VALUES ('A')")
        self.db.execute("INSERT INTO analysis_results (board_id, target_count) VALUES (1, 5)")
        history = self.db.execute("SELECT status, completed_at FROM analysis_results").fetchone()
        self.assertEqual(tuple(history), ("running", None))
        self.db.execute("UPDATE analysis_results SET status = 'failed', completed_at = created_at, error_message = '분석 실패' WHERE id = 1")
        self.db.commit()
        initialize_database(self.path)
        with closing(connect(self.path)) as reopened:
            self.assertEqual(reopened.execute("SELECT error_message FROM analysis_results").fetchone()[0], "분석 실패")
        self.db.execute("DELETE FROM boards WHERE id = 1")
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM analysis_results").fetchone()[0], 0)

    def test_analysis_history_rejects_invalid_states(self):
        self.db.execute("INSERT INTO boards (title) VALUES ('A')")
        for status, count in (("unknown", 1), ("running", -1), ("failed", 1)):
            with self.subTest(status=status, count=count), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("INSERT INTO analysis_results (board_id, status, target_count) VALUES (1, ?, ?)", (status, count))


if __name__ == "__main__":
    unittest.main()
