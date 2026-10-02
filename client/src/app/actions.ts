"use server";

import { redirect } from "next/navigation";
import { findAccount } from "@/data/accounts";
import { answer } from "@/lib/assistant";
import { getDashboard } from "@/lib/dashboard";
import { setHiddenTiles } from "@/lib/preferences";
import { createSession, deleteSession, requireSession } from "@/lib/session";

export async function login(formData: FormData) {
  const account = findAccount(formData.get("account"));
  if (!account) redirect("/login");
  await createSession(account.id);
  redirect("/overview");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function askAssistant(question: string) {
  const dashboard = await getDashboard();
  // The assistant answers from the full case record, so it is for the firm only.
  if (dashboard.role !== "firm") throw new Error("Forbidden");
  return answer(dashboard.case, String(question).slice(0, 2000));
}

// Saves which overview tiles the signed-in user has removed.
export async function saveHiddenTiles(ids: string[]) {
  const account = await requireSession();
  const clean = Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && /^[a-z-]{1,40}$/.test(id)) : [];
  await setHiddenTiles(account.id, [...new Set(clean)].slice(0, 40));
}
