// What the backend read out of the case's documents (its digest/ folder): a
// full-text search over their pages, and the facts it drew from them. Both cover
// every document on the case, so they are for the firm only.

import "server-only";
import { API } from "@/data/case";
import type { Passage } from "@/data/types";

// A page as the assistant reads it: its whole text, and whether it has every word of the question.
export type Page = Passage & { text: string; complete: boolean };

// The pages that best match a question, best first. With `full`, more of them
// and each as the assistant reads it.
export async function findPages(question: string, full: true): Promise<Page[]>;
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

// Where a treating provider's records leave off: their last visit on file and what it says.
export interface Treatment {
  provider: string; visits: number; first_visit: string; last_visit: string; // days as YYYY-MM-DD
  label: string; evidence: string | null; work_status: string | null;
  doc_id: number; page: number;
}
// The facts the digest drew from the documents: `recovery` is the latest status per
// treating provider (most recent first) and each expert's conclusions, `timeline`
// every document by its real date with a one-line summary, `bills` the charges by provider.
export interface Facts {
  recovery: { headline: string[]; providers: Treatment[]; experts: unknown[] } | null;
  timeline: unknown;
  bills: unknown;
}

export async function caseFacts(): Promise<Facts> {
  const matter = process.env.SAPINI_MATTER_ID;
  const get = async (path: string) => {
    try {
      const res = await fetch(`${API}${path}${matter ? `?matter_id=${encodeURIComponent(matter)}` : ""}`, { cache: "no-store" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const [recovery, timeline, bills] = await Promise.all([get("/case/recovery"), get("/case/timeline"), get("/case/bills")]);
  // The charges line by line are in the bills themselves, which the search finds; the totals are enough here.
  return { recovery, timeline, bills: bills && { totalCents: bills.totalCents, providers: bills.providers } };
}
