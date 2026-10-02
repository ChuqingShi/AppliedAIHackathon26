"""The one place that knows which embedding model is used. Swap the model here."""
from functools import lru_cache

MODEL_NAME = "BAAI/bge-small-en-v1.5"
DIMENSIONS = 384
MAX_TOKENS = 512  # the model silently truncates anything longer
# bge v1.5 recommends this prefix for short retrieval queries (not for documents).
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer  # slow import; only when needed

    return SentenceTransformer(MODEL_NAME)


def count_tokens(text: str) -> int:
    """Token count as the model sees it, including the [CLS]/[SEP] special tokens."""
    return len(_model().tokenizer(text)["input_ids"])


def embed_documents(texts: list[str]) -> list[list[float]]:
    too_long = [t[:60] for t in texts if count_tokens(t) > MAX_TOKENS]
    if too_long:
        raise ValueError(f"{len(too_long)} texts exceed {MAX_TOKENS} tokens, e.g. {too_long[0]!r}")
    return _model().encode(texts, normalize_embeddings=True, show_progress_bar=True).tolist()


def embed_query(question: str) -> list[float]:
    return _model().encode(QUERY_PREFIX + question, normalize_embeddings=True).tolist()
