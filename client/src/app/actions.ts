"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { findAccount } from "@/data/accounts";
import { reply } from "@/lib/assistant";
import { clearBriefing, queueBriefing } from "@/lib/briefing";
import { getDashboard } from "@/lib/dashboard";
import { DETAILS } from "@/data/details";
import type { DetailErrors, OverviewLayout } from "@/data/types";
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

export async function askAssistant(question: string) {
  const dashboard = await getDashboard();
  // The assistant answers from the full case record, so it is for the firm only.
  if (dashboard.role !== "firm") throw new Error("Forbidden");
  return reply(dashboard.case, String(question).slice(0, 2000));
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
