// Questions the firm sends to a medical provider or the client when the case
// doesn't hold an answer, and their replies. They are kept in the Sapini
// backend's database (Clio is read-only). Who may send, see and answer what is
// decided by the server actions that call these (src/app/actions.ts).

import "server-only";
import { API } from "@/data/case";
import type { Inquiry } from "@/data/types";

async function call(path: string, method?: "POST" | "PATCH", body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, method
      ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { cache: "no-store" });
  } catch {
    throw new Error(`The Sapini backend isn't answering at ${API}. Start it with: uvicorn main:app --port 8000`);
  }
  if (!res.ok) throw new Error(`The backend returned ${res.status} for ${path}. If it has been running since before it kept questions, restart it.`);
  return res.json();
}

const forCase = (caseId: string) => `/cases/${encodeURIComponent(caseId)}/inquiries`;

// Every question sent on the case, newest first.
export async function getInquiries(caseId: string): Promise<Inquiry[]> {
  return call(forCase(caseId));
}

export async function addInquiry(caseId: string, inquiry: Pick<Inquiry, "asked" | "to" | "from" | "message">): Promise<Inquiry> {
  return call(forCase(caseId), "POST", inquiry);
}

// Moves a question along: seen by its recipient, answered by them, or closed by the firm.
export async function changeInquiry(id: number, change: { seen: true } | { reply: string; repliedBy: string } | { closed: true }): Promise<Inquiry> {
  return call(`/inquiries/${id}`, "PATCH", change);
}
