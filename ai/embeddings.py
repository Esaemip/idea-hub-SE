"""Generate normalized embeddings for backend idea records."""
import unicodedata
from functools import lru_cache

MODEL_NAME = "jhgan/ko-sroberta-multitask"


def preprocess_text(text):
    if not isinstance(text, str):
        raise TypeError("idea text must be a string")
    cleaned = " ".join(unicodedata.normalize("NFC", text).split())
    if not cleaned:
        raise ValueError("idea text must contain non-whitespace characters")
    return cleaned


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def embed_ideas(ideas):
    """Return one {id, embedding} record per input, preserving input order."""
    rows = [(idea["id"], preprocess_text(idea["text"])) for idea in ideas]
    if not rows:
        return []
    vectors = _model().encode(
        [text for _, text in rows], normalize_embeddings=True, convert_to_numpy=True
    )
    return [
        {"id": idea_id, "embedding": vector.tolist()}
        for (idea_id, _), vector in zip(rows, vectors, strict=True)
    ]
