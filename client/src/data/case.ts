// The case record, as served by the Sapini backend from the synced Clio data
// (sapini-backend/case_view.py builds it). Nothing here is hardcoded: fields
// Clio does not hold arrive as null and the cards hide them.
//
// The firm gets the full Case from GET /case. A provider gets ProviderCase from
// GET /case/provider, which is trimmed on the server, so a provider's browser
// never receives firm-only data.

import type { IconName } from "@/components/Icon";

export type StatusKind = "good" | "warn";

export interface Stage { name: string; date: string }
export interface Injury { name: string; status: string; by: string }
export interface Provider { id: string; name: string; billed: number; records: StatusKind; bill: StatusKind; contact: string }
export interface Task { title: string; who: string; due: string; urgent?: boolean }
export interface CaseDocument { id: number; name: string; kind: string; date: string; important?: boolean; pending?: boolean }
export interface UpdateText { t: string; s: string }
export interface CaseUpdate { date: string; audience: string; icon: IconName; firm: UpdateText; shared?: UpdateText }
export interface TeamMember { name: string; initials: string; role: string; main?: boolean }
export interface User { name: string; initials: string; role: string }
export interface BillLine { name: string; amount: number }
export interface ProviderDocument { name: string; date: string; status: StatusKind; label: string }
export interface ProviderRequest { title: string; detail: string; due: string; daysLeft: number }

export interface Financials {
  offer: number | null; offerDate: string | null;
  demand: number | null; demandDate: string | null;
  targetLow: number | null; targetHigh: number | null;
  counter: number | null; counterDue: string | null;
  estimatedValue: number | null;
  policyLimit: number | null;
  liens: number | null;
  costs: number; feeShare: number;
  note: string | null;
}

export interface Case {
  id: string;
  matterId: number;
  title: string;
  firm: string;
  stages: Stage[];
  stageIndex: number;
  client: {
    name: string; initials: string; dob: string; age: number | null;
    phone: string | null; email: string | null; address: string | null;
    language: string | null; bestTime: string | null; occupation: string | null;
  };
  incident: { date: string; type: string; location: string; summary: string };
  injuries: Injury[];
  financials: Financials;
  defendant: string | null;
  insurer: { name: string | null; claim: string | null; adjuster: string | null };
  deadline: { label: string; date: string; daysLeft: number; met: boolean } | null;
  billsTotal: number;
  providers: Provider[];
  tasks: Task[];
  documents: CaseDocument[];
  updates: CaseUpdate[];
  team: TeamMember[];
  user: User;
}

export interface ProviderCase {
  id: string;
  firm: string;
  stages: Stage[];
  stageIndex: number;
  provider: { id: string; name: string };
  user: User;
  patient: { name: string; initials: string; dob: string; age: number | null; phone: string | null; since: string };
  incident: { date: string; type: string; summary: string };
  injuries: Injury[];
  lien: number;
  billLines: BillLine[];
  documents: ProviderDocument[];
  requests: ProviderRequest[];
  updates: { date: string; icon: IconName; t: string; s: string }[];
  team: TeamMember[];
}
