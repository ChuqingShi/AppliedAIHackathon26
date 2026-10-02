import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ACCOUNTS } from "@/data/accounts";
import { getDashboard } from "@/lib/dashboard";

// Everything in this group is behind the login. getDashboard() sends anyone who
// isn't signed in to /login, and returns only the record their role may see.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const dashboard = await getDashboard();
  const demoAccounts = ACCOUNTS.map(({ id, role }) => ({ id, role }));
  // Keyed by user so nothing held in the shell (chat, search) carries over to the next sign-in.
  return <AppShell key={dashboard.user.id} dashboard={dashboard} demoAccounts={demoAccounts}>{children}</AppShell>;
}
