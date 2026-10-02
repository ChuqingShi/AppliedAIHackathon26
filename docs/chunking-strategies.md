# Chunking strategies for the Clio PDFs

Reference for how documents are split before they go into Postgres for RAG.

## Methods

| Method | How it works | Best for | Fit here |
|---|---|---|---|
| Fixed-size / recursive | Split every N tokens, preferring paragraph/sentence breaks | Unstructured prose; fallback | Fallback only, for oversized chunks |
| Structure-aware (clause/section) | Split on the document's own units: numbered paragraphs, headings, procedural sections | Contracts, regulations, pleadings, clinical notes | ✅ Primary for court filings and medical records |
| Hierarchical / parent-child | Retrieve small chunks, hand the LLM the larger parent section | Long structured legal texts | ✅ Long expert reports (e.g. Tsao, 47 pp) |
| Semantic chunking | Embed sentences, split where topic shifts | Messy prose with no visible structure | ❌ Costly, little gain — our docs have explicit structure |
| Late chunking | Embed whole doc first, then split embeddings | Long docs with cross-section dependencies | ❌ Needs long-context embedding models; overkill |
| Tables as atomic units / rows | Detect tables, extract whole, keep out of text chunks | Bills, financial tables | ✅ Bills → SQL table |
| Contextual retrieval (Anthropic) | Prepend short context to each chunk before embedding *and* keyword (BM25) indexing | Any chunk that loses meaning in isolation | ✅ All types (metadata-built header) |

## Per document type

| Type | Files | Chunk unit | Date fields | Destination |
|---|---|---|---|---|
| Court filing | `__doc-NN__` | Numbered paragraph / section, small siblings merged; parent section linked | `filed_at` (NYSCEF stamp), `authored_at` (letter/report date) | `chunks` (semantic + full-text) |
| Medical record | `04-medical-records__created__` | One visit (= one page) | `event_date` = visit date | `chunks` |
| Medical bill | `05-medical-bills__created__` | One row per line item; one summary chunk per bill | `service_date`, `statement_date` | `bill_lines` (SQL sums) + summary in `chunks` |
| Intake | `01-intake__created__` | Whole document | — | `chunks` |

## Context header

Every chunk is prefixed with a header built from its metadata, used for both the embedding and the
full-text index, e.g.:

```
[Court filing · NYSCEF #56 · ime orthopedic hostin · filed 2026-04-09 · p.3 · AFFIRMATION OF SERVICE]
```

## Constraints

- Default embedding model `BAAI/bge-small-en-v1.5` reads at most **512 tokens** and silently drops the
  rest, so chunks are capped at ~450 tokens including the header, checked with the model's tokenizer.
- Clio's `created_at` is the upload time, not the document date; real dates come from the content.

## Sources

- [Anthropic: Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Evaluating RAG Chunking Strategies in 2026](https://futureagi.com/blog/evaluating-rag-chunking-strategies-2026/)
- [Atlan: Chunking Strategies for RAG](https://atlan.com/know/chunking-strategies-rag/)
- [A Systematic Investigation of Document Chunking Strategies (arXiv)](https://arxiv.org/html/2603.06976)
- [Towards Reliable Retrieval in RAG Systems for Large Legal Datasets (arXiv)](https://arxiv.org/pdf/2510.06999)
- [Table extraction for RAG](https://theneuralbase.com/advanced-rag/learn/intermediate/table-extraction-for-rag/)
