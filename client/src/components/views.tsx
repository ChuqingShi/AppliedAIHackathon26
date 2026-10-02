"use client";

import type { ReactNode } from "react";
import type { Role } from "@/data/nav";
import { useApp } from "./AppShell";
import { Overview } from "./Overview";
import type { Tile } from "./Overview";
import {
  CardAssistant, CardBreakdown, CardCaseFacts, CardClient, CardDocs, CardDocsFull,
  CardFinancials, CardProviderBills, CardTasks, CardUpdates,
} from "./firm-cards";
import { CardBill, CardPatient, CardProgress, CardProviderUpdates, CardRecords, CardTeam } from "./provider-cards";

// The firm's overview, row by row. Each user can remove tiles from theirs.
const FIRM_OVERVIEW: Tile[][] = [
  [
    { id: "assistant", title: "Ask about this case", width: "340px", card: <CardAssistant /> },
    { id: "financials", title: "Case financials", card: <CardFinancials /> },
    { id: "client", title: "Client", width: "320px", card: <CardClient /> },
  ],
  [
    { id: "tasks", title: "Needed on this case", card: <CardTasks limit={4} /> },
    { id: "documents", title: "Important documents", card: <CardDocs /> },
    { id: "updates", title: "Latest updates", card: <CardUpdates limit={3} /> },
  ],
];

// One entry per item in NAV (src/data/nav.ts).
const VIEWS: Record<Role, Record<string, () => ReactNode>> = {
  firm: {
    overview: () => <Overview rows={FIRM_OVERVIEW} />,
    financials: () => <><h2>Financials</h2><CardFinancials full /><div className="grid g-wide"><CardProviderBills /><CardBreakdown /></div></>,
    client: () => <><h2>Client</h2><div className="grid g-2"><CardClient full /><CardCaseFacts /></div></>,
    documents: () => <><h2>Documents</h2><CardDocsFull /></>,
    todo: () => <><h2>To-do</h2><CardTasks /></>,
    providers: () => <><h2>Medical providers</h2><CardProviderBills withMessage /></>,
    updates: () => <><h2>Updates</h2><CardUpdates /></>,
  },
  provider: {
    overview: () => (
      <>
        <div className="grid g-ptop"><CardProgress /><CardPatient /><CardTeam /></div>
        <div className="grid g-wide"><CardRecords /><CardProviderUpdates limit={4} /></div>
      </>
    ),
    patient: () => <><h2>Patient &amp; injuries</h2><div className="grid g-2"><CardPatient full /><CardRecords /></div></>,
    records: () => <><h2>Records &amp; bills</h2><div className="grid g-2"><CardRecords /><CardBill /></div></>,
    progress: () => <><h2>Case progress</h2><div className="grid g-wide"><CardProviderUpdates /><CardProgress /></div></>,
    team: () => <><h2>Legal team</h2><CardTeam full /></>,
  },
  // Placeholder until the client's dashboard is designed.
  client: {
    overview: () => (
      <div className="card">
        <div className="hd"><h3>Your case</h3></div>
        <p className="lead">Your dashboard is still being built. For now, the progress bar above shows where your case stands.</p>
      </div>
    ),
  },
};

// The view comes from the URL, the role from who is signed in.
export function View({ view }: { view: string }) {
  const { role } = useApp();
  return (VIEWS[role][view] ?? VIEWS[role].overview)();
}
