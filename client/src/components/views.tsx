"use client";

import type { ReactNode } from "react";
import type { Role } from "@/data/nav";
import { useApp } from "./AppShell";
import { Overview, SectionTile } from "./Overview";
import type { Tile } from "./Overview";
import { Briefing, ProviderBriefing } from "./Briefing";
import { CardMyDetails, CardMyIncident } from "./client-cards";
import {
  CardAttention, CardBreakdown, CardCaseFacts, CardClient, CardDocs, CardDocsFull,
  CardFinancials, CardMoney, CardProviderBills, CardStatus, CardTasks, CardUpdates,
} from "./firm-cards";
import { CardBill, CardPatient, CardProgress, CardProviderUpdates, CardRecords, CardTeam } from "./provider-cards";

// Every tile the firm's overview can show. Those with a `row` are there by
// default; the rest are added from their section. A new tile is one entry here
// (or in P, for providers) plus a <SectionTile> wherever it should be offered.
//
// The default overview reads top to bottom as: what needs action today (alone in
// its row, so it spans the page), where the case is and the money in brief, then
// the to-dos and latest updates. The full financials, client and documents
// cards live on their own pages and can be added back from there.
const T = {
  attention: { id: "attention", title: "Needs attention", row: 0, card: <CardAttention /> },
  status: { id: "status", title: "Where the case is", row: 1, card: <CardStatus /> },
  money: { id: "money", title: "Money at a glance", row: 1, card: <CardMoney /> },
  tasks: { id: "tasks", title: "Needed on this case", row: 2, card: <CardTasks limit={4} /> },
  updates: { id: "updates", title: "Latest updates", row: 2, card: <CardUpdates limit={3} /> },
  financials: { id: "financials", title: "Case financials", size: "l", card: <CardFinancials /> },
  client: { id: "client", title: "Client", card: <CardClient /> },
  documents: { id: "documents", title: "Important documents", card: <CardDocs /> },
  providerBills: { id: "provider-bills", title: "Medical bills by provider", size: "m", card: <CardProviderBills /> },
  breakdown: { id: "breakdown", title: "Settlement breakdown", card: <CardBreakdown /> },
  caseFacts: { id: "case-facts", title: "Case details", card: <CardCaseFacts /> },
} satisfies Record<string, Tile>;

// The same for a provider's overview. Each card is built from the provider's
// own record, so a tile shows nothing its section doesn't.
const P = {
  progress: { id: "progress", title: "How the case is going", row: 0, card: <CardProgress /> },
  patient: { id: "patient", title: "Patient", row: 0, card: <CardPatient /> },
  team: { id: "team", title: "Legal team", row: 0, card: <CardTeam /> },
  records: { id: "records", title: "Your medical records & documents", row: 1, size: "m", card: <CardRecords /> },
  updates: { id: "status-updates", title: "Status updates", row: 1, card: <CardProviderUpdates limit={4} /> },
  bill: { id: "bill", title: "Your bill", card: <CardBill /> },
} satisfies Record<string, Tile>;

// One entry per item in NAV (src/data/nav.ts).
const VIEWS: Record<Role, Record<string, () => ReactNode>> = {
  firm: {
    // The sign-in briefing pops up over the overview (once per sign-in; see components/Briefing.tsx).
    overview: () => <><Briefing /><Overview tiles={Object.values(T)} /></>,
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
    // The provider's own sign-in briefing pops up over their overview too.
    overview: () => <><ProviderBriefing /><Overview tiles={Object.values(P)} /></>,
    patient: () => (
      <>
        <h2>Patient &amp; injuries</h2>
        <div className="grid g-2">
          <SectionTile tile={P.patient}><CardPatient full /></SectionTile>
          <SectionTile tile={P.records}><CardRecords /></SectionTile>
        </div>
      </>
    ),
    records: () => (
      <>
        <h2>Records &amp; bills</h2>
        <div className="grid g-2">
          <SectionTile tile={P.records}><CardRecords /></SectionTile>
          <SectionTile tile={P.bill}><CardBill /></SectionTile>
        </div>
      </>
    ),
    progress: () => (
      <>
        <h2>Case progress</h2>
        <div className="grid g-wide">
          <SectionTile tile={P.updates}><CardProviderUpdates /></SectionTile>
          <SectionTile tile={P.progress}><CardProgress /></SectionTile>
        </div>
      </>
    ),
    team: () => <><h2>Legal team</h2><SectionTile tile={P.team}><CardTeam full /></SectionTile></>,
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
