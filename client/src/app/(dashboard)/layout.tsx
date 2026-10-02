import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { getAccounts } from "@/data/accounts";
import { briefingPending } from "@/lib/briefing";
import { getDashboard } from "@/lib/dashboard";
import { getOverviewLayout } from "@/lib/preferences";

// Everything in this group is behind the login. getDashboard() sends anyone who
// isn't signed in to /login, and returns only the record their role may see.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const dashboard = await getDashboard();
  // The sidebar's role switcher: one account per role (the first listed for each).
  const accounts = await getAccounts();
  const demoAccounts = accounts
    .filter((a, i) => accounts.findIndex((b) => b.role === a.role) === i)
    .map(({ id, role }) => ({ id, role }));
  const overview = await getOverviewLayout(dashboard.user.id);
  // Whether the firm's sign-in briefing still has to pop up (see src/lib/briefing.ts).
  const briefing = dashboard.role === "firm" && (await briefingPending());
  // Keyed by user so nothing held in the shell (chat, search) carries over to the next sign-in.
  return <AppShell key={dashboard.user.id} dashboard={dashboard} overview={overview} demoAccounts={demoAccounts} briefing={briefing}>{children}</AppShell>;
}
