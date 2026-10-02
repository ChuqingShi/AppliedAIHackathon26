"""Clio PDF → Postgres RAG pipeline.

DEPRECATED: not used, kept for reference. The live pipeline is the rule-based
AppliedAIHackathon26-client-backend/digest/ on main. See README.md.

Stages (each reads the previous stage's file, so later stages can be re-run cheaply):
    clio_client  Clio API          → data/raw/*.pdf, data/documents.json
    extract      data/raw/*.pdf    → data/pages.jsonl
    build        data/pages.jsonl  → data/documents_parsed.jsonl, data/chunks.jsonl, data/bill_lines.jsonl
    load         data/*.jsonl      → Postgres (documents, chunks, bill_lines)
    search       question          → ranked chunks
"""
import json
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
DATA = ROOT / "data"
RAW = DATA / "raw"

load_dotenv(ENV_PATH)


def read_jsonl(path: Path) -> list[dict]:
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with open(path, "w") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
