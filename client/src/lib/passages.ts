// Full-text search over the pages of the case's documents. The backend does it
// (digest/search.py) from the text it read out of each synced PDF. It looks
// through every document on the case, so it is for the firm only.

import "server-only";
import { API } from "@/data/case";
import type { Passage } from "@/data/types";

// The pages that best match a question, best first. With `full`, more of them
// and each page's whole text as well, for the assistant to read.
export async function findPages(question: string, full: true): Promise<(Passage & { text: string })[]>;
export async function findPages(question: string): Promise<Passage[]>;
export async function findPages(question: string, full = false): Promise<Passage[]> {
  const params = new URLSearchParams({ q: question });
  const matter = process.env.SAPINI_MATTER_ID;
  if (matter) params.set("matter_id", matter);
  if (full) { params.set("full", "true"); params.set("limit", "12"); }
  try {
    const res = await fetch(`${API}/case/search?${params}`, { cache: "no-store" });
    if (res.ok) return await res.json();
    console.warn(`Document search: the backend returned ${res.status} for /case/search. If it has been running since before it had this, restart it.`);
  } catch {
    console.warn(`Document search: the Sapini backend isn't answering at ${API}.`);
  }
  // The search box still works without the documents: it has the case record.
  return [];
}
