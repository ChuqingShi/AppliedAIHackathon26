// The one place the dashboard's data comes from. It reads who is signed in and
// returns only the record that role may see, so components can't over-fetch.
// The case itself comes from the Sapini backend (src/data/case.ts).

import "server-only";
import { cache } from "react";
import { forClient, forProvider, loadCase } from "@/data/case";
import type { Dashboard } from "@/data/types";
import { briefing } from "./assistant";
import { requireSession } from "./session";

export const getDashboard = cache(async (): Promise<Dashboard> => {
  const account = await requireSession();
  const user = { id: account.id, name: account.name, initials: account.initials, title: account.title };
  const c = await loadCase();
  switch (account.role) {
    case "firm": return { role: "firm", user, case: c, briefing: briefing(c) };
    case "provider": return { role: "provider", user, case: forProvider(c, account.providerId) };
    case "client": return { role: "client", user, case: forClient(c) };
  }
});
