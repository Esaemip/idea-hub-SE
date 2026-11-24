from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient

from backend.database import connect
from backend.main import create_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "test.sqlite3"
        self.client = TestClient(create_app(self.path))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def test_board_and_idea_lifecycle(self):
        self.assertEqual(self.client.get('/boards').json(), [])
        board = self.client.post('/boards', json={'title': '회의'})
        self.assertEqual(board.status_code, 201)
        board_id = board.json()['id']
        card = self.client.post(f'/boards/{board_id}/ideas', json={'text': '로그인'})
        self.assertEqual(card.status_code, 201)
        idea = card.json()
        self.assertIsNone(idea['group_id'])
        self.assertIs(idea['assignment_is_manual'], False)
        self.assertIsNone(idea['analyzed_at'])
        idea_id = idea['id']
        self.assertEqual(self.client.patch(f'/boards/{board_id}/ideas/{idea_id}', json={'text': '소셜 로그인'}).json()['text'], '소셜 로그인')
        with TestClient(create_app(self.path)) as restarted:
            self.assertEqual(restarted.get(f'/boards/{board_id}').json()['ideas'][0]['text'], '소셜 로그인')
        self.assertEqual(self.client.delete(f'/boards/{board_id}/ideas/{idea_id}').status_code, 204)
        self.assertEqual(self.client.delete(f'/boards/{board_id}').status_code, 204)
        self.assertEqual(self.client.get(f'/boards/{board_id}').status_code, 404)

    def test_validation_and_board_isolation(self):
        self.assertEqual(self.client.post('/boards', json={'title': '   '}).status_code, 422)
        first = self.client.post('/boards', json={'title': 'A'}).json()['id']
        second = self.client.post('/boards', json={'title': 'B'}).json()['id']
        self.assertEqual(self.client.post(f'/boards/{first}/ideas', json={'text': ' '}).status_code, 422)
        self.assertEqual(self.client.post('/boards/999/ideas', json={'text': 'x'}).status_code, 404)
        idea = self.client.post(f'/boards/{first}/ideas', json={'text': 'x'}).json()['id']
        self.assertEqual(self.client.patch(f'/boards/{second}/ideas/{idea}', json={'text': 'y'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/boards/{second}/ideas/{idea}').status_code, 404)
        self.assertEqual(self.client.get(f'/boards/{first}').json()['ideas'][0]['text'], 'x')

    def test_local_frontend_preflight(self):
        response = self.client.options('/boards', headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:5173')

    def test_group_rename_and_manual_card_assignment_survive_restart(self):
        board = self.client.post("/boards", json={"title": "회의"}).json()
        board_url = f"/boards/{board['id']}"
        created = self.client.post(f"{board_url}/groups", json={"name": "로그인"})
        self.assertEqual(created.status_code, 201)
        group = created.json()
        self.assertIs(group["name_is_manual"], True)
        group_id = group["id"]
        renamed = self.client.patch(f"{board_url}/groups/{group_id}", json={"name": "계정 기능"})
        self.assertEqual(renamed.status_code, 200)
        self.assertIs(renamed.json()["name_is_manual"], True)

        card = self.client.post(f"{board_url}/ideas", json={"text": "소셜 로그인"}).json()
        move_url = f"{board_url}/ideas/{card['id']}/group"
        moved = self.client.patch(move_url, json={"group_id": group_id})
        self.assertEqual(moved.status_code, 200)
        self.assertEqual(moved.json()["group_id"], group_id)
        self.assertIs(moved.json()["assignment_is_manual"], True)

        with TestClient(create_app(self.path)) as restarted:
            board = restarted.get(board_url).json()
            self.assertEqual(board["groups"][0]["name"], "계정 기능")
            self.assertEqual(board["ideas"][0]["group_id"], group_id)
            unclassified = restarted.patch(move_url, json={"group_id": None})
            self.assertEqual(unclassified.status_code, 200)
            self.assertIsNone(unclassified.json()["group_id"])
            self.assertIs(unclassified.json()["assignment_is_manual"], True)

    def test_group_deletion_preserves_its_cards(self):
        board = self.client.post("/boards", json={"title": "A"}).json()
        board_url = f"/boards/{board['id']}"
        group = self.client.post(f"{board_url}/groups", json={"name": "계정"}).json()
        card = self.client.post(f"{board_url}/ideas", json={"text": "로그인"}).json()
        self.client.patch(f"{board_url}/ideas/{card['id']}/group", json={"group_id": group["id"]})

        deleted = self.client.delete(f"{board_url}/groups/{group['id']}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(deleted.content, b"")
        board = self.client.get(board_url).json()
        self.assertEqual(board["groups"], [])
        self.assertEqual(board["ideas"][0]["id"], card["id"])
        self.assertIsNone(board["ideas"][0]["group_id"])
        self.assertIs(board["ideas"][0]["assignment_is_manual"], True)

    def test_group_validation_and_board_isolation(self):
        first = self.client.post("/boards", json={"title": "A"}).json()["id"]
        second = self.client.post("/boards", json={"title": "B"}).json()["id"]
        group = self.client.post(f"/boards/{second}/groups", json={"name": "계정"}).json()
        group_id = group["id"]
        card = self.client.post(f"/boards/{first}/ideas", json={"text": "로그인"}).json()
        move_url = f"/boards/{first}/ideas/{card['id']}/group"
        wrong_group_url = f"/boards/{first}/groups/{group_id}"

        self.assertEqual(self.client.post(f"/boards/{first}/groups", json={"name": " "}).status_code, 422)
        for invalid in ({}, {"group_id": str(group_id)}, {"group_id": True}, {"group_id": 2**63}):
            with self.subTest(payload=invalid):
                self.assertEqual(self.client.patch(move_url, json=invalid).status_code, 422)
        self.assertEqual(self.client.patch(move_url, json={"group_id": group_id}).status_code, 404)
        self.assertEqual(self.client.patch(wrong_group_url, json={"name": "변경"}).status_code, 404)
        self.assertEqual(self.client.delete(wrong_group_url).status_code, 404)
        self.assertEqual(self.client.get(f"/boards/{second}").json()["groups"], [group])
        self.assertIs(self.client.get(f"/boards/{first}").json()["ideas"][0]["assignment_is_manual"], False)


    def test_mock_analysis_groups_new_cards_without_writing_to_database(self):
        board = self.client.post("/boards", json={"title": "기획 회의"}).json()
        board_url = f"/boards/{board['id']}"
        for text in ("마감 알림", "제출 전에 알려주기", "메뉴 추천"):
            self.assertEqual(
                self.client.post(f"{board_url}/ideas", json={"text": text}).status_code,
                201,
            )
        saved = self.client.get(board_url).json()

        result = self.client.post(f"{board_url}/analyze", json={})
        self.assertEqual(result.status_code, 200)
        preview = result.json()
        self.assertEqual(preview.keys(), saved.keys())
        self.assertEqual(preview["id"], saved["id"])
        self.assertEqual(len(preview["groups"]), 1)
        group = preview["groups"][0]
        self.assertLess(group["id"], 0)
        self.assertEqual(group["board_id"], board["id"])
        self.assertEqual([card["id"] for card in preview["ideas"]], [card["id"] for card in saved["ideas"]])
        self.assertEqual(
            [card["group_id"] for card in preview["ideas"]],
            [group["id"], group["id"], None],
        )
        self.assertTrue(all(card["analyzed_at"] is not None for card in preview["ideas"]))
        self.assertEqual(self.client.get(board_url).json(), saved)
        with closing(connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM analysis_results").fetchone()[0], 0)

    def test_mock_analysis_keeps_manual_and_previously_analyzed_cards(self):
        board = self.client.post("/boards", json={"title": "기획 회의"}).json()
        board_url = f"/boards/{board['id']}"
        group = self.client.post(f"{board_url}/groups", json={"name": "기존 그룹"}).json()
        cards = [
            self.client.post(f"{board_url}/ideas", json={"text": text}).json()
            for text in ("수동 배정", "미분류로 고정", "이전 분석", "새 카드")
        ]
        for card, group_id in ((cards[0], group["id"]), (cards[1], None)):
            self.assertEqual(
                self.client.patch(f"{board_url}/ideas/{card['id']}/group", json={"group_id": group_id}).status_code,
                200,
            )
        with closing(connect(self.path)) as db, db:
            db.execute(
                "UPDATE ideas SET analyzed_at = created_at WHERE id = ?",
                (cards[2]["id"],),
            )
        saved = self.client.get(board_url).json()

        preview = self.client.post(f"{board_url}/analyze", json={}).json()
        self.assertEqual(preview["groups"], saved["groups"])
        self.assertEqual(preview["ideas"][:3], saved["ideas"][:3])
        self.assertIsNone(preview["ideas"][3]["group_id"])
        self.assertIsNotNone(preview["ideas"][3]["analyzed_at"])

    def test_mock_analysis_empty_board_and_missing_board(self):
        board = self.client.post("/boards", json={"title": "빈 보드"}).json()
        board_url = f"/boards/{board['id']}"
        current = self.client.get(board_url).json()
        self.assertEqual(self.client.post(f"{board_url}/analyze", json={}).json(), current)
        self.assertEqual(self.client.post("/boards/999/analyze", json={}).status_code, 404)


if __name__ == '__main__':
    unittest.main()
