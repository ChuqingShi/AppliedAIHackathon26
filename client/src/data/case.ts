// Sample data for the prototype. Everything here is fictional.
//
// CASE is the full record the law firm sees. forProvider() and forClient()
// build the trimmed records the other two roles see. This module only runs on
// the server, so a provider's or client's browser never receives firm-only data.

import "server-only";
import type { Case, ClientCase, ProviderCase } from "./types";

export const CASE: Case = {
  id: "PI-2026-0142",
  title: "Alvarez v. Coastal Freight Lines",
  shortTitle: "Alvarez v. Coastal Freight",
  defendant: "Coastal Freight Lines",
  firm: "Whitfield Lee LLP",

  stages: [
    { name: "Intake", date: "Feb 18" },
    { name: "Treatment", date: "Feb 20 – Aug 28" },
    { name: "Records & bills", date: "Sep 11" },
    { name: "Demand sent", date: "Sep 18" },
    { name: "Negotiation", date: "Since Sep 30" },
    { name: "Settlement", date: "Upcoming" },
    { name: "Providers paid", date: "Upcoming" },
  ],
  stageIndex: 4,

  client: {
    name: "Maria Alvarez", initials: "MA", dob: "Mar 3, 1992", age: 34,
    phone: "(555) 014-2290", email: "maria.alvarez@example.com",
    address: "418 Larkspur Ave, Apt 2, Oakland, CA",
    language: "English, Spanish", bestTime: "Weekdays after 4 PM",
    occupation: "Dental hygienist · missed 9 weeks of work",
  },

  incident: {
    date: "Feb 14, 2026", type: "Motor vehicle collision",
    location: "Broadway & 27th St, Oakland",
    summary: "Rear-ended by a Coastal Freight delivery truck while stopped at a red light.",
  },

  injuries: [
    { name: "Right shoulder — rotator cuff tear", status: "Surgery May 12 · recovered", by: "Summit Orthopedics" },
    { name: "Neck strain (whiplash)", status: "Resolved after physical therapy", by: "Bayview Physical Therapy" },
    { name: "Lower back strain", status: "Improved with pain injections", by: "Harbor Pain Management" },
  ],

  // ---- firm only ----
  financials: {
    offer: 62000, offerDate: "Sep 30",
    demand: 185000, demandDate: "Sep 18",
    targetLow: 120000, targetHigh: 150000,
    counter: 165000, counterDue: "Tue, Oct 6",
    policyLimit: 250000,
    costs: 3000, feeShare: 1 / 3,
  },
  insurer: { name: "Pacific Mutual Insurance", claim: "CL-88-204417", adjuster: "R. Hollis" },
  deadline: { label: "Filing deadline", date: "Feb 14, 2028", daysLeft: 500 },

  providers: [
    { id: "summit", name: "Summit Orthopedics", billed: 18450, records: "good", bill: "good", contact: "Jenna Brooks" },
    { id: "harbor", name: "Harbor Pain Management", billed: 12600, records: "good", bill: "warn", contact: "Sam Ortiz" },
    { id: "bayview", name: "Bayview Physical Therapy", billed: 9200, records: "good", bill: "good", contact: "Lena Park" },
    { id: "mercy", name: "Mercy General ER", billed: 6950, records: "good", bill: "good", contact: "Billing office" },
    { id: "clearview", name: "Clearview Imaging", billed: 4800, records: "good", bill: "good", contact: "Billing office" },
  ],

  tasks: [
    { title: "Call client to review the offer", who: "Dana Whitfield", due: "Mon, Oct 5", urgent: true },
    { title: "Get final bill from Harbor Pain", who: "Priya Nair", due: "Mon, Oct 5", urgent: true },
    { title: "Send counteroffer ($165,000)", who: "Dana Whitfield", due: "Tue, Oct 6" },
    { title: "Narrative report due from Summit", who: "Priya Nair", due: "Thu, Oct 8" },
    { title: "Draft complaint (fallback if talks stall)", who: "Marcus Lee", due: "Tue, Oct 20" },
  ],

  documents: [
    { name: "Insurer offer letter", kind: "Negotiation", date: "Sep 30", important: true },
    { name: "Demand package", kind: "Negotiation", date: "Sep 18", important: true },
    { name: "Medical records — all providers", kind: "Medical", date: "Sep 11", important: true },
    { name: "Itemized medical bills", kind: "Medical", date: "Sep 11", important: true },
    { name: "Police report", kind: "Incident", date: "Feb 16" },
    { name: "Dashcam footage", kind: "Incident", date: "Feb 19" },
    { name: "Client retainer agreement", kind: "Client", date: "Feb 18" },
    { name: "Lost wage statement", kind: "Client", date: "Sep 2" },
    { name: "Narrative report — shoulder surgery", kind: "Medical", date: "Due Oct 8", pending: true },
  ],

  // audience: 'firm' = never shared, 'all' = every provider, or a provider id.
  // `shared` is the provider-safe wording (no amounts, no strategy).
  updates: [
    { date: "Oct 1", audience: "summit", icon: "doc",
      firm: { t: "Narrative report requested from Summit", s: "To answer the adjuster on why the shoulder surgery was needed. Due Oct 8." },
      shared: { t: "The law firm asked you for a narrative report", s: "A short letter from the surgeon on why the shoulder surgery was needed. Due Thursday, Oct 8." } },
    { date: "Sep 30", audience: "firm", icon: "dollar",
      firm: { t: "Insurer made a first offer: $62,000", s: "About a third of our demand. The adjuster disputes the need for surgery." } },
    { date: "Sep 30", audience: "all", icon: "flag",
      firm: { t: "Case moved to Negotiation", s: "All 5 providers were notified, without any amounts." },
      shared: { t: "The case moved to Negotiation", s: "The insurance company has responded and talks are underway." } },
    { date: "Sep 25", audience: "harbor", icon: "upload",
      firm: { t: "Harbor Pain Management uploaded procedure notes", s: "18 pages added. Their final bill is still outstanding." } },
    { date: "Sep 18", audience: "all", icon: "send",
      firm: { t: "Demand package sent to the insurer", s: "$185,000 demand with all records and $52,000 in medical bills." },
      shared: { t: "The demand was sent to the insurance company", s: "Your full bill was included." } },
    { date: "Sep 15", audience: "summit", icon: "dollar",
      firm: { t: "Summit Orthopedics final bill confirmed", s: "Itemized ledger accepted at $18,450." },
      shared: { t: "Your final bill was confirmed", s: "Itemized ledger accepted at $18,450." } },
    { date: "Sep 11", audience: "all", icon: "folder",
      firm: { t: "All medical records collected", s: "Records are in from all 5 providers." },
      shared: { t: "All medical records were collected", s: "Nothing is missing from you." } },
    { date: "Aug 28", audience: "all", icon: "check",
      firm: { t: "Client completed treatment", s: "Discharged from physical therapy." },
      shared: { t: "Patient completed treatment", s: "Final follow-up visit recorded." } },
  ],

  team: [
    { name: "Dana Whitfield", initials: "DW", role: "Lead attorney" },
    { name: "Marcus Lee", initials: "ML", role: "Associate attorney" },
    { name: "Priya Nair", initials: "PN", role: "Case manager", main: true },
    { name: "Tom Becker", initials: "TB", role: "Paralegal" },
  ],

  // what each provider has on file with the firm
  providerFiles: {
    summit: {
      patientSince: "Feb 20, 2026",
      billLines: [
        { name: "Shoulder surgery (arthroscopic)", amount: 13500 },
        { name: "Office visits (6)", amount: 2100 },
        { name: "Medical equipment (sling, brace)", amount: 1450 },
        { name: "Post-op follow-ups (4)", amount: 1400 },
      ],
      documents: [
        { name: "Itemized billing ledger (final)", date: "Uploaded Sep 15", status: "good", label: "Accepted" },
        { name: "Medical records · 124 pages", date: "Uploaded Sep 10", status: "good", label: "Accepted" },
        { name: "Signed lien agreement", date: "Feb 23", status: "good", label: "On file" },
        { name: "Narrative report — shoulder surgery", date: "Requested Oct 1", status: "warn", label: "Due Oct 8" },
      ],
      requests: [
        { title: "Narrative report — shoulder surgery", detail: "A short letter from the surgeon on why the surgery was needed.", due: "Thu, Oct 8", daysLeft: 6 },
      ],
    },
  },
};

// The record a provider is allowed to see. Whitelist only: anything not copied
// here (financials, strategy, tasks, other providers, firm-only updates) stays out.
export function forProvider(c: Case, providerId: string): ProviderCase {
  const me = c.providers.find((p) => p.id === providerId)!;
  const file = c.providerFiles[providerId];
  return {
    id: c.id, firm: c.firm, stages: c.stages, stageIndex: c.stageIndex,
    provider: { id: me.id, name: me.name },
    patient: { name: c.client.name, initials: c.client.initials, dob: c.client.dob, age: c.client.age, phone: c.client.phone, since: file.patientSince },
    incident: { date: c.incident.date, type: c.incident.type, summary: c.incident.summary },
    injuries: c.injuries,
    lien: me.billed,
    billLines: file.billLines, documents: file.documents, requests: file.requests,
    updates: c.updates
      .filter((u) => u.shared && (u.audience === "all" || u.audience === providerId))
      .map((u) => ({ date: u.date, icon: u.icon, t: u.shared!.t, s: u.shared!.s })),
    team: c.team,
  };
}

// The record the client (plaintiff) is allowed to see. Same rule: whitelist only.
// Their dashboard isn't designed yet, so this is just what the shared shell shows.
export function forClient(c: Case): ClientCase {
  return {
    id: c.id, firm: c.firm, stages: c.stages, stageIndex: c.stageIndex,
    title: c.title, shortTitle: c.shortTitle,
  };
}
