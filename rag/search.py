"""Hybrid retrieval: vector similarity + full-text, merged with reciprocal rank fusion (RRF).

Run: uv run python -m rag.search "question" [--type court_filing] [--since 2025-01-01] [-k 5]
"""
import argparse

from pgvector import Vector

from rag.embed import embed_query
from rag.load import connect

CANDIDATES = 30  # per retriever, before fusion
RRF_K = 60       # standard RRF damping constant

# Filters are applied inside both retrievers, so they narrow candidates before ranking.
SQL = """
with filtered as (
    select c.* from chunks c join documents d on d.id = c.document_id
    where c.embedding is not null
      and (%(doc_type)s::text is null or d.doc_type = %(doc_type)s)
      and (%(since)s::date is null or coalesce(c.event_date, d.doc_date) >= %(since)s)
),
semantic as (
    select id, row_number() over (order by embedding <=> %(qvec)s) as rank
    from filtered order by embedding <=> %(qvec)s limit %(n)s
),
keyword as (
    select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as rank
    -- OR the question's terms: AND (the default) almost never matches a natural-language question
    from filtered, (select replace(plainto_tsquery('english', %(q)s)::text, '&', '|')::tsquery as q) t
    where tsv @@ q order by ts_rank_cd(tsv, q) desc limit %(n)s
),
fused as (
    select id, sum(1.0 / (%(rrf_k)s + rank)) as score
    from (select * from semantic union all select * from keyword) r group by id
)
select f.score, c.id, c.parent_id, c.page_start, c.page_end, c.event_date, c.context_header, c.text,
       d.file_name, d.doc_date,
       exists(select 1 from semantic s where s.id = c.id) as by_vector,
       exists(select 1 from keyword k where k.id = c.id) as by_keyword
from fused f join chunks c on c.id = f.id join documents d on d.id = c.document_id
order by f.score desc limit %(k)s
"""


def search(question: str, k: int = 5, doc_type: str | None = None, since: str | None = None) -> list[dict]:
    params = {"qvec": Vector(embed_query(question)), "q": question, "n": CANDIDATES, "rrf_k": RRF_K,
              "k": k, "doc_type": doc_type, "since": since}
    with connect() as conn, conn.cursor() as cur:
        cur.execute(SQL, params)
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("question")
    ap.add_argument("-k", type=int, default=5)
    ap.add_argument("--type", dest="doc_type")
    ap.add_argument("--since")
    args = ap.parse_args()
    for r in search(args.question, args.k, args.doc_type, args.since):
        via = "+".join(m for m, hit in (("vector", r["by_vector"]), ("keyword", r["by_keyword"])) if hit)
        print(f"{r['score']:.4f} [{via}] {r['context_header']}")
        print("   ", " ".join(r["text"].split())[:220], "\n")


if __name__ == "__main__":
    main()
