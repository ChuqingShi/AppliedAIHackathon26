// What a user asked the assistant and what it answered, kept under their account
// in the Sapini backend so they can go back over it from any computer.

import "server-only";
import { API } from "@/data/case";
import type { ChatMessage } from "@/data/types";

const pathFor = (userId: string, caseId: string) =>
  `${API}/users/${encodeURIComponent(userId)}/chat?case_id=${encodeURIComponent(caseId)}`;

// The conversation so far, oldest first. Empty if the backend can't give it: a
// missing history is no reason to keep the assistant from answering.
export async function getHistory(userId: string, caseId: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(pathFor(userId, caseId), { cache: "no-store" });
    if (res.ok) return await res.json();
    console.warn(`History: the backend returned ${res.status}. If it has been running since before it kept history, restart it.`);
  } catch {
    console.warn(`History: the Sapini backend isn't answering at ${API}.`);
  }
  return [];
}

export async function addHistory(userId: string, caseId: string, messages: ChatMessage[]) {
  const res = await fetch(pathFor(userId, caseId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`The backend returned ${res.status} saving the conversation`);
}

export async function clearHistory(userId: string, caseId: string) {
  const res = await fetch(pathFor(userId, caseId), { method: "DELETE" });
  if (!res.ok) throw new Error(`The backend returned ${res.status} clearing the conversation`);
}
