// The case record, loaded from the Sapini backend, which digests the matter
// synced from Clio (AppliedAIHackathon26-client-backend/case_view.py). Nothing
// here is hardcoded.
//
// loadCase() gets the full record the law firm sees. forProvider() and
// forClient() build the trimmed records the other two roles see. This module
// only runs on the server, so a provider's or client's browser never receives
// firm-only data.

import "server-only";
import { cache } from "react";
import type { Case, ClientCase, ProviderCase } from "./types";

export const API = process.env.SAPINI_API_URL ?? "http://127.0.0.1:8000";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// The backend sends the client's date of birth ready to display ("Mar 3, 1992").
// The dashboard keeps it as YYYY-MM-DD, which is what the client's own changes
// are stored as (src/lib/profile.ts), and formats it where it is shown.
function isoDay(text: string) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(text);
  const month = m ? MONTHS.indexOf(m[1]) + 1 : 0;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : text;
}

// Once per request: the layout, the page and the accounts all share one fetch.
export const loadCase = cache(async (): Promise<Case> => {
  const matter = process.env.SAPINI_MATTER_ID;
  const url = `${API}/case${matter ? `?matter_id=${encodeURIComponent(matter)}` : ""}`;
  let res: Response;
  try {
    // no-store: always show what is in the backend now, never a cached copy
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error(`The Sapini backend isn't answering at ${API}. Start it with: uvicorn main:app --port 8000`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `The backend returned ${res.status} for /case`);
  }
  const c: Case = await res.json();
  return { ...c, client: { ...c.client, dob: isoDay(c.client.dob) } };
});

// The record a provider is allowed to see. Whitelist only: anything not copied
// here (financials, strategy, tasks, other providers, firm-only updates) stays out.
export function forProvider(c: Case, providerId: string): ProviderCase {
  const me = c.providers.find((p) => p.id === providerId);
  const file = c.providerFiles[providerId];
  if (!me || !file) throw new Error(`No provider "${providerId}" on this case`);
  // The personal details the client keeps up to date are for their providers as well as the firm.
  const { name, initials, dob, age, phone, email, address, language, bestTime, occupation, updated } = c.client;
  return {
    id: c.id, firm: c.firm, stages: c.stages, stageIndex: c.stageIndex,
    provider: { id: me.id, name: me.name },
    patient: { name, initials, dob, age, phone, email, address, language, bestTime, occupation, updated, since: file.patientSince },
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
// They get what the firm holds about them personally, their legal team and the
// names of the providers treating them, but none of the money or the firm's own notes.
export function forClient(c: Case): ClientCase {
  return {
    id: c.id, firm: c.firm, stages: c.stages, stageIndex: c.stageIndex,
    title: c.title, shortTitle: c.shortTitle,
    client: c.client, incident: c.incident, injuries: c.injuries,
    team: c.team,
    providers: c.providers.map((p) => ({ name: p.name, since: c.providerFiles[p.id]?.patientSince ?? "" })),
  };
}
