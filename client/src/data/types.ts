// The shapes the dashboard works with. Types only, so this is safe to import
// from client components; the data itself is built on the server (src/lib/dashboard.ts)
// from the Sapini backend's digest of the Clio matter. Fields Clio doesn't hold
// arrive as null and the cards leave them out.

import type { IconName } from "@/components/Icon";

export type StatusKind = "good" | "warn";

export interface Stage { name: string; date: string }
export interface Injury { name: string; status: string; by: string }
export interface Provider { id: string; name: string; billed: number; records: StatusKind; bill: StatusKind; contact: string }
// `daysLeft` is negative once the task is overdue, and null when it has no due date.
export interface Task { title: string; who: string; due: string; daysLeft?: number | null; urgent?: boolean }
export interface CaseDocument { id?: number; name: string; kind: string; date: string; important?: boolean; pending?: boolean }
export interface UpdateText { t: string; s: string }
export interface CaseUpdate { date: string; audience: string; icon: IconName; firm: UpdateText; shared?: UpdateText }
export interface TeamMember { name: string; initials: string; role: string; main?: boolean }
export interface BillLine { name: string; amount: number }
export interface ProviderDocument { name: string; date: string; status: StatusKind; label: string }
export interface ProviderRequest { title: string; detail: string; due: string; daysLeft: number }
export interface ProviderFile {
  user: { name: string; initials: string; role: string }; // the provider's contact on this case
  patientSince: string;
  billLines: BillLine[];
  documents: ProviderDocument[];
  requests: ProviderRequest[];
}

// The personal details a client can read and change about themselves, as they
// send them (src/data/details.ts lists them). `dob` is YYYY-MM-DD.
export interface ClientDetails {
  name: string; dob: string;
  phone: string; email: string; address: string;
  language: string; bestTime: string; occupation: string;
}
// The client as the firm holds them. A detail Clio doesn't have is null (`dob`
// is "") until the client fills it in. `updated` is the day (YYYY-MM-DD) the
// client last changed their details, if they have.
export interface Client {
  name: string; initials: string; dob: string; age: number | null;
  phone: string | null; email: string | null; address: string | null;
  language: string | null; bestTime: string | null; occupation: string | null;
  updated?: string;
}
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
  defendant: string | null;
  // When the case started and ended: the matter's open and close dates in Clio.
  // `closed` is null while the case is open; `length` is how long it has run ("3 years, 4 months").
  dates: { opened: string | null; closed: string | null; length: string | null };
  // The document id of the client's photo ID, if one is on file. Firm only: forClient()
  // and forProvider() never copy it, so an identity document stays inside the firm.
  photoIdDoc: number | null;
  client: Client;
  incident: { date: string; type: string; location: string; summary: string };
  injuries: Injury[];
  financials: {
    offer: number | null; offerDate: string | null;
    demand: number | null; demandDate: string | null;
    targetLow: number | null; targetHigh: number | null;
    counter: number | null; counterDue: string | null;
    estimatedValue: number | null;
    policyLimit: number | null;
    liens: number | null; // asserted against the recovery (e.g. a Medicaid lien)
    costs: number; feeShare: number;
    note: string | null; // the firm's own read on the numbers
  };
  insurer: { name: string | null; claim: string | null; adjuster: string | null };
  deadline: { label: string; date: string; daysLeft: number; met: boolean } | null;
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

// The widths a user can set a tile to: a third, a half or two thirds of its row.
export type TileSize = "s" | "m" | "l";

// What a user has changed on their overview, as tile ids: the tiles they took
// off (in that order), the ones they added from other sections, once they have
// dragged tiles around, which row each one sits in (`rows`; empty until then),
// the size of each tile they resized (`sizes`; the rest fit around those), and
// the tiles they locked in place (`locked`; Auto-arrange leaves those alone).
export interface OverviewLayout { removed: string[]; added: string[]; rows: string[][]; sizes: Record<string, TileSize>; locked: string[] }

// One dashboard, three roles: the signed-in user's role decides which record
// the server builds, and so what the browser receives.
export type Dashboard =
  | { role: "firm"; user: User; case: Case; briefing: string }
  | { role: "provider"; user: User; case: ProviderCase }
  | { role: "client"; user: User; case: ClientCase };
