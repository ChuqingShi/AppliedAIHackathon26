// The one place the dashboard's data comes from. It reads who is signed in and
// returns only the record that role may see, so components can't over-fetch.
// Swap the sample case for calls to the backend here.

import "server-only";
import { cache } from "react";
import { CASE, forClient, forProvider } from "@/data/case";
import type { Dashboard } from "@/data/types";
import { briefing } from "./assistant";
import { requireSession } from "./session";

export const getDashboard = cache(async (): Promise<Dashboard> => {
  const account = await requireSession();
  const user = { id: account.id, name: account.name, initials: account.initials, title: account.title };
  switch (account.role) {
    case "firm": return { role: "firm", user, case: CASE, briefing: briefing(CASE) };
    case "provider": return { role: "provider", user, case: forProvider(CASE, account.providerId) };
    case "client": return { role: "client", user, case: forClient(CASE) };
  }
});
