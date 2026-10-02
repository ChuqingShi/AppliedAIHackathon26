// The shapes the dashboard works with. Types only, so this is safe to import
// from client components; the data itself is built on the server (src/lib/dashboard.ts).

import type { IconName } from "@/components/Icon";

export type StatusKind = "good" | "warn";

export interface Stage { name: string; date: string }
export interface Injury { name: string; status: string; by: string }
export interface Provider { id: string; name: string; billed: number; records: StatusKind; bill: StatusKind; contact: string }
export interface Task { title: string; who: string; due: string; urgent?: boolean }
export interface CaseDocument { name: string; kind: string; date: string; important?: boolean; pending?: boolean }
export interface UpdateText { t: string; s: string }
export interface CaseUpdate { date: string; audience: string; icon: IconName; firm: UpdateText; shared?: UpdateText }
export interface TeamMember { name: string; initials: string; role: string; main?: boolean }
export interface BillLine { name: string; amount: number }
export interface ProviderDocument { name: string; date: string; status: StatusKind; label: string }
export interface ProviderRequest { title: string; detail: string; due: string; daysLeft: number }
export interface ProviderFile {
  patientSince: string;
  billLines: BillLine[];
  documents: ProviderDocument[];
  requests: ProviderRequest[];
}

// The personal details the firm holds on its client. The client can read and
// change these (src/data/details.ts lists them). `dob` is YYYY-MM-DD.
export interface ClientDetails {
  name: string; dob: string;
  phone: string; email: string; address: string;
  language: string; bestTime: string; occupation: string;
}
// `updated` is the day (YYYY-MM-DD) the client last changed their details, if they have.
export interface Client extends ClientDetails { initials: string; age: number; updated?: string }
// What is wrong with the details a client sent, by field.
export type DetailErrors = Partial<Record<keyof ClientDetails, string>>;

// What every role sees: which case this is and how far along it is.
export interface CaseFrame {
  id: string;
  firm: string;
  stages: Stage[];
  stageIndex: number;
}

// The full record. Only the law firm gets this.
export interface Case extends CaseFrame {
  title: string;
  shortTitle: string;
  defendant: string;
  client: Client;
  incident: { date: string; type: string; location: string; summary: string };
  injuries: Injury[];
  financials: {
    offer: number; offerDate: string;
    demand: number; demandDate: string;
    targetLow: number; targetHigh: number;
    counter: number; counterDue: string;
    policyLimit: number;
    costs: number; feeShare: number;
  };
  insurer: { name: string; claim: string; adjuster: string };
  deadline: { label: string; date: string; daysLeft: number };
  providers: Provider[];
  tasks: Task[];
  documents: CaseDocument[];
  updates: CaseUpdate[];
  team: TeamMember[];
  providerFiles: Record<string, ProviderFile>;
}

// What one medical provider sees: status changes and their own bills and records.
export interface ProviderCase extends CaseFrame {
  provider: { id: string; name: string };
  patient: { name: string; initials: string; dob: string; age: number; phone: string; since: string };
  incident: { date: string; type: string; summary: string };
  injuries: Injury[];
  lien: number;
  billLines: BillLine[];
  documents: ProviderDocument[];
  requests: ProviderRequest[];
  updates: { date: string; icon: IconName; t: string; s: string }[];
  team: TeamMember[];
}

// What the client (the plaintiff) sees. The rest of their dashboard isn't
// designed yet, so for now this is what the shared shell needs and what the
// firm holds about them personally.
export interface ClientCase extends CaseFrame {
  title: string;
  shortTitle: string;
  client: Client;
  incident: Case["incident"];
  injuries: Injury[];
}

export interface User { id: string; name: string; initials: string; title: string }

// What a user has changed on their overview, as tile ids: the tiles they took
// off (in that order) and the ones they added from other sections.
export interface OverviewLayout { removed: string[]; added: string[] }

// One dashboard, three roles: the signed-in user's role decides which record
// the server builds, and so what the browser receives.
export type Dashboard =
  | { role: "firm"; user: User; case: Case; briefing: string }
  | { role: "provider"; user: User; case: ProviderCase }
  | { role: "client"; user: User; case: ClientCase };
