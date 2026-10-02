"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { recipients } from "@/components/format";
import { findAccount } from "@/data/accounts";
import { reply } from "@/lib/assistant";
import { clearBriefing, queueBriefing } from "@/lib/briefing";
import { getDashboard } from "@/lib/dashboard";
import { addHistory, clearHistory } from "@/lib/history";
import { addInquiry, changeInquiry } from "@/lib/inquiries";
import { DETAILS } from "@/data/details";
import type { ChatMessage, DetailErrors, OverviewLayout } from "@/data/types";
import { setOverviewLayout } from "@/lib/preferences";
import { checkDetails, setClientEdits } from "@/lib/profile";
import { createSession, deleteSession, getSession, requireSession } from "@/lib/session";

export async function login(formData: FormData) {
  const account = await findAccount(formData.get("account"));
  if (!account) redirect("/login");
  await createSession(account.id);
  // The firm and medical providers get a briefing of what matters over their overview, once per sign-in.
  if (account.role === "firm" || account.role === "provider") await queueBriefing();
  redirect("/overview");
}

// Closes the sign-in briefing for good (until the next sign-in).
export async function dismissBriefing() {
  await requireSession();
  await clearBriefing();
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

// Who this browser is signed in as now. The shell asks when its tab is looked at
// again, in case another tab has signed in as someone else since.
export async function currentAccount() {
  return (await getSession())?.id ?? null;
}

export async function askAssistant(question: string): Promise<ChatMessage> {
  const dashboard = await getDashboard();
  // The assistant answers from the full case record, so it is for the firm only.
  if (dashboard.role !== "firm") throw new Error("Forbidden");
  const q = String(question).slice(0, 2000);
  const answer: ChatMessage = { ...(await reply(dashboard, q)), asked: q, at: new Date().toISOString() };
  // Kept, so the firm can go back over what they asked. Not keeping it doesn't lose the answer.
  await addHistory(dashboard.user.id, dashboard.case.id, [{ me: true, text: q, at: answer.at }, answer]).catch((e) => console.warn(`History: ${e}`));
  return answer;
}

// Forgets the signed-in user's conversation with the assistant on this case.
export async function forgetHistory() {
  const dashboard = await getDashboard();
  if (dashboard.role !== "firm") throw new Error("Forbidden");
  await clearHistory(dashboard.user.id, dashboard.case.id);
  refresh();
}

// Sends a question from the firm to the client or to a medical provider on the
// case. `asked` is what was typed in the search box that led to it, if anything.
export async function sendInquiry(asked: string | null, to: string, message: string) {
  const dashboard = await getDashboard();
  if (dashboard.role !== "firm") throw new Error("Forbidden");
  const recipient = recipients(dashboard.case).find((r) => r.id === to);
  const text = String(message).trim().slice(0, 4000);
  if (!recipient || !text) throw new Error("A question needs someone on the case to go to, and a message");
  await addInquiry(dashboard.case.id, {
    asked: asked ? String(asked).slice(0, 2000) : null,
    to: { id: recipient.id, name: recipient.name }, from: dashboard.user.name, message: text,
  });
  // Send the questions back with the reply, now that this one is among them.
  refresh();
}

// Marks the questions sent to the signed-in provider or client as seen, which the firm is shown.
export async function seeInquiries() {
  const dashboard = await getDashboard();
  if (dashboard.role === "firm") return;
  await Promise.all(dashboard.inquiries.filter((q) => !q.seenAt).map((q) => changeInquiry(q.id, { seen: true })));
}

// Answers a question. Only the provider or client it was sent to can.
export async function answerInquiry(id: number, answer: string) {
  const dashboard = await getDashboard();
  const text = String(answer).trim().slice(0, 4000);
  // A provider's and the client's `inquiries` are only their own.
  if (dashboard.role === "firm" || !dashboard.inquiries.some((q) => q.id === id) || !text) throw new Error("Forbidden");
  await changeInquiry(id, { reply: text, repliedBy: dashboard.user.name });
  refresh();
}

// The firm is done with a question (it has what it needed, or no longer needs it).
export async function closeInquiry(id: number) {
  const dashboard = await getDashboard();
  if (dashboard.role !== "firm" || !dashboard.inquiries.some((q) => q.id === id)) throw new Error("Forbidden");
  await changeInquiry(id, { closed: true });
  refresh();
}

// Saves which tiles the signed-in user has removed from and added to their overview, and how they arranged, sized and locked them.
export async function saveOverviewLayout(layout: OverviewLayout) {
  const account = await requireSession();
  await setOverviewLayout(account.id, layout);
  // Send the saved layout back with the reply, so the shell goes on showing it once the save is done.
  refresh();
}

// Saves the client's changes to their own personal details and returns what is
// wrong with them, or null once they are saved. Only the client can change them.
export async function saveClientDetails(form: FormData): Promise<DetailErrors | null> {
  const dashboard = await getDashboard();
  if (dashboard.role !== "client") throw new Error("Forbidden");
  const checked = checkDetails((key) => form.get(key));
  if ("errors" in checked) return checked.errors;
  const { client } = dashboard.case;
  if (DETAILS.some((f) => checked.details[f.key] !== client[f.key])) {
    await setClientEdits(dashboard.case.id, checked.details);
    // Send the case back with the reply, now that it has the saved details.
    refresh();
  }
  return null;
}
