"""Incremental allocation proposals for the P2 server/AI contract."""
from itertools import combinations
from statistics import fmean

from .embeddings import embed_ideas, preprocess_text
from .similarity import pairwise_similarities


def _index(rows, key):
    result = {}
    for row in rows:
        value = row[key]
        if type(value) is not int or value in result:
            raise ValueError(f"Invalid or duplicate {key}: {value!r}")
        result[value] = row
    return result


def _cluster(ids, score, threshold):
    """Complete-link clustering. Sorted IDs break equal-score ties."""
    clusters = [(i,) for i in sorted(ids)]
    while len(clusters) > 1:
        best = None
        for left, right in combinations(clusters, 2):
            weakest = min(score(i, j) for i in left for j in right)
            if weakest >= threshold and (best is None or weakest > best[0]):
                best = weakest, left, right
        if best is None:
            break
        _, left, right = best
        clusters.remove(left)
        clusters.remove(right)
        clusters.append(tuple(sorted(left + right)))
        clusters.sort()
    return clusters


def propose_idea_groups(board_id, target_idea_ids, groups, ideas, *,
                        existing_threshold=0.65, new_threshold=0.70,
                        existing_margin=0.05):
    """Return a P2 delta. Threshold defaults are provisional tuning parameters."""
    if not (-1 <= existing_threshold <= 1 and -1 <= new_threshold <= 1
            and 0 <= existing_margin <= 2):
        raise ValueError("Invalid cosine threshold or margin")
    by_group = _index(groups, "group_id")
    by_idea = _index(ideas, "idea_id")
    targets = set(target_idea_ids)
    if (len(targets) != len(target_idea_ids)
            or any(type(i) is not int for i in targets)
            or not targets.issubset(by_idea)):
        raise ValueError("Invalid, duplicate or unknown target ID")
    members = {g: [] for g in by_group}
    for i, idea in by_idea.items():
        group = idea["group_id"]
        if group is not None:
            if group not in members:
                raise ValueError("Unknown group on idea")
            members[group].append(i)
        if i in targets and (idea["assignment_is_manual"] is not False
                             or group is not None):
            raise ValueError("Targets must be unassigned and non-manual")

    proposal = {"board_id": board_id, "groups": [], "unclassified_idea_ids": []}
    if not targets:
        return proposal
    batch = [{"id": i, "text": idea["text"]} for i, idea in by_idea.items()
             if i in targets or idea["group_id"] is not None]
    pairs = pairwise_similarities(embed_ideas(batch))
    scores = {tuple(sorted((p["left_id"], p["right_id"]))): p["similarity"]
              for p in pairs}

    def score(i, j):
        return scores[min(i, j), max(i, j)]

    assigned = {}
    remaining = []
    for i in sorted(targets):
        ranked = sorted(((fmean(score(i, j) for j in refs), g)
                         for g, refs in members.items() if refs), reverse=True)
        if ranked and ranked[0][0] >= existing_threshold:
            top, group = ranked[0]
            if len(ranked) == 1 or (top > ranked[1][0]
                                    and top - ranked[1][0] >= existing_margin):
                assigned.setdefault(group, []).append(i)
                continue
        remaining.append(i)

    for group, ids in sorted(assigned.items()):
        proposal["groups"].append({"group_id": group, "name": by_group[group]["name"],
                                   "idea_ids": ids})
    for ids in _cluster(remaining, score, new_threshold):
        if len(ids) == 1:
            proposal["unclassified_idea_ids"].append(ids[0])
            continue
        representative = max(ids, key=lambda i: sum(score(i, j) for j in ids if j != i))
        name = preprocess_text(by_idea[representative]["text"])[:40]
        proposal["groups"].append({"group_id": None, "name": name, "idea_ids": list(ids)})
    return proposal
