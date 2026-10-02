"use server";

import { redirect } from "next/navigation";
import { findAccount } from "@/data/accounts";
import { answer } from "@/lib/assistant";
import { getDashboard } from "@/lib/dashboard";
import { createSession, deleteSession } from "@/lib/session";

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
