from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import os

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

    def test_concurrent_card_creation_does_not_lock_database(self):
        board_id = self.client.post('/boards', json={'title': '동시 입력'}).json()['id']

        def create_card(index):
            return self.client.post(f'/boards/{board_id}/ideas', json={'text': f'카드 {index}'})

        with ThreadPoolExecutor(max_workers=8) as executor:
            responses = list(executor.map(create_card, range(20)))

        self.assertTrue(all(response.status_code == 201 for response in responses))
        self.assertEqual(len(self.client.get(f'/boards/{board_id}').json()['ideas']), 20)

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


    def test_analysis_runs_grouping_and_persists_results(self):
        from unittest.mock import patch
        board = self.client.post("/boards", json={"title": "기획"}).json()
        url = f"/boards/{board['id']}"
        existing = self.client.post(f"{url}/groups", json={"name": "내 알림"}).json()
        manual = self.client.post(f"{url}/ideas", json={"text": "기존 알림"}).json()
        self.client.patch(f"{url}/ideas/{manual['id']}/group", json={"group_id": existing["id"]})
        locked = self.client.post(f"{url}/ideas", json={"text": "수동 미분류"}).json()
        self.client.patch(f"{url}/ideas/{locked['id']}/group", json={"group_id": None})
        cards = [self.client.post(f"{url}/ideas", json={"text": text}).json()
                 for text in ("새 알림", "메뉴 추천", "식당 추천", "사진 편집")]
        vectors = {"기존 알림": [1, 0, 0], "새 알림": [1, 0, 0],
                   "메뉴 추천": [0, 1, 0], "식당 추천": [0, 1, 0], "사진 편집": [0, 0, 1]}
        def encode(batch):
            return [{"id": row["id"], "embedding": vectors[row["text"]]} for row in batch]
        with patch("ai.grouping.embed_ideas", side_effect=encode) as model:
            response = self.client.post(f"{url}/analyze", json={})
            self.assertEqual(response.status_code, 200)
            model.assert_called_once()
        result = response.json()
        self.assertEqual(result, self.client.get(url).json())
        self.assertEqual(result["groups"][0]["name"], "내 알림")
        self.assertTrue(result["groups"][0]["name_is_manual"])
        items = {item["id"]: item for item in result["ideas"]}
        self.assertEqual(items[manual["id"]]["group_id"], existing["id"])
        self.assertIsNone(items[locked["id"]]["group_id"])
        self.assertIsNone(items[locked["id"]]["analyzed_at"])
        self.assertEqual(items[cards[0]["id"]]["group_id"], existing["id"])
        new_group = items[cards[1]["id"]]["group_id"]
        self.assertGreater(new_group, 0)
        self.assertEqual(new_group, items[cards[2]["id"]]["group_id"])
        self.assertIsNone(items[cards[3]["id"]]["group_id"])
        self.assertTrue(all(items[card["id"]]["analyzed_at"] for card in cards))
        with patch("ai.grouping.embed_ideas") as model:
            self.assertEqual(self.client.post(f"{url}/analyze", json={}).json(), result)
            model.assert_not_called()
        with TestClient(create_app(self.path)) as restarted:
            self.assertEqual(restarted.get(url).json(), result)

    def test_analysis_failure_does_not_change_board(self):
        from unittest.mock import patch
        board_id = self.client.post("/boards", json={"title": "보드"}).json()["id"]
        url = f"/boards/{board_id}"
        self.client.post(f"{url}/ideas", json={"text": "카드"})
        before = self.client.get(url).json()
        for result in (RuntimeError("모델 실패"),
                       {"board_id": board_id, "groups": [], "unclassified_idea_ids": []}):
            with self.subTest(result=result), patch("backend.main.propose_idea_groups") as model:
                if isinstance(result, Exception):
                    model.side_effect = result
                else:
                    model.return_value = result
                self.assertEqual(self.client.post(f"{url}/analyze", json={}).status_code, 503)
                self.assertEqual(self.client.get(url).json(), before)

    def test_analysis_rejects_concurrent_edits(self):
        from unittest.mock import patch
        board_id = self.client.post("/boards", json={"title": "보드"}).json()["id"]
        url = f"/boards/{board_id}"
        card = self.client.post(f"{url}/ideas", json={"text": "원래 내용"}).json()
        def analyze(**request):
            with closing(connect(self.path)) as db, db:
                db.execute("UPDATE ideas SET text = ? WHERE id = ?", ("수정된 내용", card["id"]))
            return {"board_id": board_id, "groups": [], "unclassified_idea_ids": [card["id"]]}
        with patch("backend.main.propose_idea_groups", side_effect=analyze):
            self.assertEqual(self.client.post(f"{url}/analyze", json={}).status_code, 409)
        idea = self.client.get(url).json()["ideas"][0]
        self.assertEqual(idea["text"], "수정된 내용")
        self.assertIsNone(idea["analyzed_at"])

    def test_analysis_empty_board_and_missing_board(self):
        from unittest.mock import patch
        board = self.client.post("/boards", json={"title": "빈 보드"}).json()
        url = f"/boards/{board['id']}"
        current = self.client.get(url).json()
        with patch("backend.main.propose_idea_groups") as model:
            self.assertEqual(self.client.post(f"{url}/analyze", json={}).json(), current)
            self.assertEqual(self.client.post("/boards/999/analyze", json={}).status_code, 404)
            model.assert_not_called()

    @unittest.skipUnless(os.getenv("IDEA_HUB_REAL_MODEL") == "1", "requires model weights")
    def test_analysis_with_real_model(self):
        board_id = self.client.post("/boards", json={"title": "실제 모델"}).json()["id"]
        url = f"/boards/{board_id}"
        cards = [self.client.post(f"{url}/ideas", json={"text": text}).json()
                 for text in ("마감 전에 알려줘", "제출 기한이 다가오면 알림을 보내줘",
                              "식당 메뉴를 추천해 줘")]
        response = self.client.post(f"{url}/analyze", json={})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        ideas = {row["id"]: row for row in result["ideas"]}
        group_id = ideas[cards[0]["id"]]["group_id"]
        self.assertIsNotNone(group_id)
        self.assertEqual(ideas[cards[1]["id"]]["group_id"], group_id)
        self.assertIsNone(ideas[cards[2]["id"]]["group_id"])
        self.assertTrue(all(ideas[card["id"]]["analyzed_at"] for card in cards))
        self.assertEqual(self.client.get(url).json(), result)
        with closing(connect(self.path)) as db:
            history = db.execute('SELECT status, target_count, completed_at FROM analysis_results WHERE board_id = ?', (board_id,)).fetchone()
            self.assertEqual((history['status'], history['target_count']), ('completed', 3))
            self.assertIsNotNone(history['completed_at'])


if __name__ == '__main__':
    unittest.main()
