// Demo accounts, one per person on the case in Clio: the firm's user, each
// medical provider's contact and the client. Stand-ins until the backend has
// real users: signing in is just picking one of these.

import "server-only";
import { unanswered } from "@/components/format";
import { getInquiries } from "@/lib/inquiries";
import { loadCase } from "./case";
import type { User } from "./types";

export type Account =
  | (User & { role: "firm" })
  | (User & { role: "provider"; providerId: string })
  | (User & { role: "client" });

export async function getAccounts(): Promise<Account[]> {
  const c = await loadCase();
  const lead = c.team.find((m) => m.main) ?? c.team[0];
  const firm: Account[] = lead ? [{ id: "firm", role: "firm", name: lead.name, initials: lead.initials, title: lead.role }] : [];
  // Providers we're waiting on come first, so the demo opens on one with something
  // to do: a question from the firm to answer, before records to send.
  const asked = unanswered(await getInquiries(c.id));
  const waiting = (id: string) => asked.filter((q) => q.to.id === id).length * 100 + c.providerFiles[id].requests.length;
  const providers = [...c.providers].sort((a, b) => waiting(b.id) - waiting(a.id));
  return [
    ...firm,
    ...providers.map((p): Account => {
      const { user } = c.providerFiles[p.id];
      return { id: `provider-${p.id}`, role: "provider", providerId: p.id, name: user.name, initials: user.initials, title: user.role };
    }),
    { id: "client", role: "client", name: c.client.name, initials: c.client.initials, title: "Plaintiff" },
  ];
}

export async function findAccount(id: unknown) {
  return (await getAccounts()).find((a) => a.id === id);
}
