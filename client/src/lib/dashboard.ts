// The one place the dashboard's data comes from. It reads who is signed in and
// returns only the record that role may see, so components can't over-fetch.
// Swap the sample case for calls to the backend here.

import "server-only";
import { cache } from "react";
import { CASE, forClient, forProvider } from "@/data/case";
import type { Dashboard } from "@/data/types";
import { briefing } from "./assistant";
import { getClientEdits, withClientEdits } from "./profile";
import { requireSession } from "./session";

export const getDashboard = cache(async (): Promise<Dashboard> => {
  const account = await requireSession();
  const user = { id: account.id, name: account.name, initials: account.initials, title: account.title };
  // The sample case plus what the client has since changed about themselves.
  const c = withClientEdits(CASE, await getClientEdits());
  switch (account.role) {
    case "firm": return { role: "firm", user, case: c, briefing: briefing(c) };
    case "provider": return { role: "provider", user, case: forProvider(c, account.providerId) };
    // The client goes by the name on their record, which they can change.
    case "client": return { role: "client", user: { ...user, name: c.client.name, initials: c.client.initials }, case: forClient(c) };
  }
});
