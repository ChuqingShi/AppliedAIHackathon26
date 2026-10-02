"use client";

import type { ReactNode } from "react";
import type { Role } from "@/data/nav";
import {
  CardAssistant, CardBreakdown, CardCaseFacts, CardClient, CardDocs, CardDocsFull,
  CardFinancials, CardProviderBills, CardTasks, CardUpdates,
} from "./firm-cards";
import { CardBill, CardPatient, CardProgress, CardProviderUpdates, CardRecords, CardTeam } from "./provider-cards";

// One entry per item in NAV (src/data/nav.ts).
const VIEWS: Record<Role, Record<string, () => ReactNode>> = {
  firm: {
    overview: () => (
      <>
        <div className="grid g-top"><CardAssistant /><CardFinancials /><CardClient /></div>
        <div className="grid g-3"><CardTasks limit={4} /><CardDocs /><CardUpdates limit={3} /></div>
      </>
    ),
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
};

export function View({ role, view }: { role: Role; view: string }) {
  return (VIEWS[role][view] ?? VIEWS[role].overview)();
}
