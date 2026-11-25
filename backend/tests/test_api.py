from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from fastapi.testclient import TestClient

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


if __name__ == '__main__':
    unittest.main()
