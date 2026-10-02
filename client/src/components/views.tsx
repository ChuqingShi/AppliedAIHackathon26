"use client";

import type { ReactNode } from "react";
import type { Role } from "@/data/nav";
import { useApp } from "./AppShell";
import { Overview, SectionTile } from "./Overview";
import type { Tile } from "./Overview";
import { CardMyDetails, CardMyIncident } from "./client-cards";
import {
  CardBreakdown, CardCaseFacts, CardClient, CardDocs, CardDocsFull,
  CardFinancials, CardProviderBills, CardTasks, CardUpdates,
} from "./firm-cards";
import { CardBill, CardPatient, CardProgress, CardProviderUpdates, CardRecords, CardTeam } from "./provider-cards";

// Every tile the firm's overview can show. Those with a `row` are there by
// default; the rest are added from their section. A new tile is one entry here
// plus a <SectionTile> wherever it should be offered.
const T = {
  financials: { id: "financials", title: "Case financials", row: 0, size: "l", card: <CardFinancials /> },
  client: { id: "client", title: "Client", row: 0, card: <CardClient /> },
  tasks: { id: "tasks", title: "Needed on this case", row: 1, card: <CardTasks limit={4} /> },
  documents: { id: "documents", title: "Important documents", row: 1, card: <CardDocs /> },
  updates: { id: "updates", title: "Latest updates", row: 1, card: <CardUpdates limit={3} /> },
  providerBills: { id: "provider-bills", title: "Medical bills by provider", size: "m", card: <CardProviderBills /> },
  breakdown: { id: "breakdown", title: "Settlement breakdown", card: <CardBreakdown /> },
  caseFacts: { id: "case-facts", title: "Case details", card: <CardCaseFacts /> },
} satisfies Record<string, Tile>;

// One entry per item in NAV (src/data/nav.ts).
const VIEWS: Record<Role, Record<string, () => ReactNode>> = {
  firm: {
    overview: () => <Overview tiles={Object.values(T)} />,
    financials: () => (
      <>
        <h2>Financials</h2>
        <SectionTile tile={T.financials}><CardFinancials full /></SectionTile>
        <div className="grid g-wide">
          <SectionTile tile={T.providerBills}><CardProviderBills /></SectionTile>
          <SectionTile tile={T.breakdown}><CardBreakdown /></SectionTile>
        </div>
      </>
    ),
    client: () => (
      <>
        <h2>Client</h2>
        <div className="grid g-2">
          <SectionTile tile={T.client}><CardClient full /></SectionTile>
          <SectionTile tile={T.caseFacts}><CardCaseFacts /></SectionTile>
        </div>
      </>
    ),
    documents: () => <><h2>Documents</h2><SectionTile tile={T.documents}><CardDocsFull /></SectionTile></>,
    todo: () => <><h2>To-do</h2><SectionTile tile={T.tasks}><CardTasks /></SectionTile></>,
    providers: () => <><h2>Medical providers</h2><SectionTile tile={T.providerBills}><CardProviderBills withMessage /></SectionTile></>,
    updates: () => <><h2>Updates</h2><SectionTile tile={T.updates}><CardUpdates /></SectionTile></>,
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
  // The overview is a placeholder until the client's dashboard is designed.
  client: {
    overview: () => (
      <div className="card">
        <div className="hd"><h3>Your case</h3></div>
        <p className="lead">Your dashboard is still being built. For now, the progress bar above shows where your case stands.</p>
      </div>
    ),
    profile: () => (
      <>
        <h2>My information</h2>
        <div className="grid g-2">
          <CardMyDetails />
          <CardMyIncident />
        </div>
      </>
    ),
  },
};

// The view comes from the URL, the role from who is signed in.
export function View({ view }: { view: string }) {
  const { role } = useApp();
  return (VIEWS[role][view] ?? VIEWS[role].overview)();
}
