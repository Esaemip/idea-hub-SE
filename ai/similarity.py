"""Pairwise cosine similarity for unit vectors returned by embed_ideas."""
from itertools import combinations
from math import fsum


def pairwise_similarities(embedded_ideas):
    """Return each distinct input pair once, in input order."""
    scores = []
    for left, right in combinations(embedded_ideas, 2):
        components = zip(left["embedding"], right["embedding"], strict=True)
        cosine = fsum(a * b for a, b in components)
        scores.append({
            "left_id": left["id"],
            "right_id": right["id"],
            "similarity": max(-1.0, min(1.0, cosine)),
        })
    return scores
