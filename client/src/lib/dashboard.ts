// The one place the dashboard's data comes from. It reads who is signed in and
// returns only the record that role may see, so components can't over-fetch.
// The case itself comes from the Sapini backend (src/data/case.ts).

import "server-only";
import { cache } from "react";
import { forClient, forProvider, loadCase } from "@/data/case";
import type { Dashboard } from "@/data/types";
import { CLIENT } from "@/data/nav";
import { briefing, briefingForClient, briefingForProvider } from "./assistant";
import { getHistory } from "./history";
import { getInquiries } from "./inquiries";
import { getUploads } from "./uploads";
import { getClientEdits, withClientEdits } from "./profile";
import { requireSession } from "./session";

export const getDashboard = cache(async (): Promise<Dashboard> => {
  const account = await requireSession();
  const user = { id: account.id, name: account.name, initials: account.initials, title: account.title };
  // The case from the backend plus what the client has since changed about themselves.
  const loaded = await loadCase();
  const c = withClientEdits(loaded, await getClientEdits(loaded.id));
  // The questions the firm has sent. A provider and the client get only those sent
  // to them, without what the firm asked its assistant before sending.
  const inquiries = await getInquiries(c.id);
  const sentTo = (id: string) => inquiries.filter((q) => q.to.id === id).map((q) => ({ ...q, asked: null }));
  // Files providers uploaded for the firm: the firm gets them all, a provider only their own.
  const uploads = account.role === "client" ? [] : await getUploads(c.id);
  // What this user asked the assistant before. It is kept per account, so no one gets another's.
  const history = await getHistory(account.id, c.id);
  switch (account.role) {
    case "firm": return { role: "firm", user, case: c, briefing: briefing(c), inquiries, history, uploads };
    case "provider": {
      const [mine, asked] = [forProvider(c, account.providerId), sentTo(account.providerId)];
      return { role: "provider", user, case: mine, briefing: briefingForProvider(mine, asked), inquiries: asked, history,
        uploads: uploads.filter((u) => u.provider.id === account.providerId) };
    }
    // The client goes by the name on their record, which they can change.
    case "client": {
      const [mine, asked] = [forClient(c), sentTo(CLIENT)];
      return { role: "client", user: { ...user, name: c.client.name, initials: c.client.initials }, case: mine, briefing: briefingForClient(mine, asked), inquiries: asked, history };
    }
  }
});
