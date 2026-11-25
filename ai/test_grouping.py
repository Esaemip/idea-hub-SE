import copy
import json
import os
import unittest
from unittest.mock import patch

from ai.embeddings import _model
from ai.grouping import propose_idea_groups


def idea(i, text, group=None, manual=False):
    return dict(idea_id=i, text=text, group_id=group, assignment_is_manual=manual)


def example():
    return dict(board_id=1, target_idea_ids=[2, 3, 4, 5],
                groups=[dict(group_id=10, name="내 마감 알림", name_is_manual=True)],
                ideas=[idea(1, "마감 전에 알려줘", 10, True),
                       idea(2, "제출 기한이 다가오면 알림을 보내줘"),
                       idea(3, "식당 메뉴를 추천해 줘"),
                       idea(4, "식당 메뉴를 추천해 줘!"),
                       idea(5, "사진 배경을 투명하게 지우기"),
                       idea(6, "식당 메뉴를 추천해 줘", manual=True)])


class GroupingTests(unittest.TestCase):
    def test_all_destinations_and_preservation(self):
        request = example()
        original = copy.deepcopy(request)
        vectors = [[1, 0, 0], [.8, .6, 0], [0, 1, 0], [0, 1, 0], [0, 0, 1]]
        def encode(batch):
            self.assertEqual([r["id"] for r in batch], [1, 2, 3, 4, 5])
            return [dict(id=r["id"], embedding=v) for r, v in zip(batch, vectors, strict=True)]
        with patch("ai.grouping.embed_ideas", side_effect=encode) as model:
            result = propose_idea_groups(**request)
            model.assert_called_once()
            stricter = propose_idea_groups(**request, existing_threshold=.9)
        self.assertEqual(result["groups"], [
            dict(group_id=10, name="내 마감 알림", idea_ids=[2]),
            dict(group_id=None, name="식당 메뉴를 추천해 줘", idea_ids=[3, 4])])
        self.assertEqual(result["unclassified_idea_ids"], [5])
        self.assertEqual(stricter["unclassified_idea_ids"], [2, 5])
        self.assertEqual(request, original)

    def test_invalid_targets_and_empty(self):
        request = example()
        with patch("ai.grouping.embed_ideas") as model:
            for ids in ([2, 2], [99], [1], [6]):
                with self.subTest(ids=ids), self.assertRaises(ValueError):
                    propose_idea_groups(**dict(request, target_idea_ids=ids))
            self.assertEqual(propose_idea_groups(**dict(request, target_idea_ids=[])),
                             dict(board_id=1, groups=[], unclassified_idea_ids=[]))
            model.assert_not_called()

    @unittest.skipUnless(os.getenv("IDEA_HUB_REAL_MODEL") == "1", "requires model weights")
    def test_real_model(self):
        result = propose_idea_groups(**example())
        print("GROUPING_RESULT", json.dumps(result, ensure_ascii=False))
        self.assertEqual([(g["group_id"], g["idea_ids"]) for g in result["groups"]],
                         [(10, [2]), (None, [3, 4])])
        self.assertEqual(result["unclassified_idea_ids"], [5])
        self.assertIs(_model(), _model())

    def test_bridge_does_not_join_unrelated_endpoints(self):
        request = dict(board_id=1, groups=[], target_idea_ids=[3, 1, 2],
                       ideas=[idea(i, str(i)) for i in (1, 2, 3)])
        # Adjacent pairs score 0.8, but the two endpoints score 0.28.
        rows = [dict(id=i, embedding=v) for i, v in
                [(1, [.8, .6]), (2, [1, 0]), (3, [.8, -.6])]]
        with patch("ai.grouping.embed_ideas", return_value=rows):
            result = propose_idea_groups(**request)
            strict = propose_idea_groups(**request, new_threshold=.85)
        self.assertEqual([g["idea_ids"] for g in result["groups"]], [[1, 2]])
        self.assertEqual(result["unclassified_idea_ids"], [3])
        self.assertEqual(strict["unclassified_idea_ids"], [1, 2, 3])

    def test_ambiguous_existing_groups(self):
        request = dict(board_id=1, target_idea_ids=[3],
                       groups=[dict(group_id=i, name=str(i), name_is_manual=True)
                               for i in (10, 20)],
                       ideas=[idea(1, "A", 10), idea(2, "B", 20), idea(3, "C")])
        rows = [dict(id=1, embedding=[1, 0]), dict(id=2, embedding=[.98, .199]),
                dict(id=3, embedding=[1, 0])]
        with patch("ai.grouping.embed_ideas", return_value=rows):
            result = propose_idea_groups(**request)
            relaxed = propose_idea_groups(**request, existing_margin=.01)
        self.assertEqual(result["unclassified_idea_ids"], [3])
        self.assertEqual(relaxed["groups"][0]["group_id"], 10)

    @unittest.skipUnless(os.getenv("IDEA_HUB_REAL_MODEL") == "1", "requires model weights")
    def test_first_analysis_with_paraphrases(self):
        request = dict(board_id=1, groups=[], target_idea_ids=[1, 2, 3],
                       ideas=[idea(1, "마감 전에 알려줘"),
                              idea(2, "제출 기한이 다가오면 알림을 보내줘"),
                              idea(3, "식당 메뉴를 추천해 줘")])
        result = propose_idea_groups(**request)
        self.assertEqual([(g["group_id"], g["idea_ids"]) for g in result["groups"]],
                         [(None, [1, 2])])
        self.assertEqual(result["unclassified_idea_ids"], [3])
