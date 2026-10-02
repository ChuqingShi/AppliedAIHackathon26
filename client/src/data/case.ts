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

const API = process.env.SAPINI_API_URL ?? "http://127.0.0.1:8000";

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
  return res.json();
});

// The record a provider is allowed to see. Whitelist only: anything not copied
// here (financials, strategy, tasks, other providers, firm-only updates) stays out.
export function forProvider(c: Case, providerId: string): ProviderCase {
  const me = c.providers.find((p) => p.id === providerId);
  const file = c.providerFiles[providerId];
  if (!me || !file) throw new Error(`No provider "${providerId}" on this case`);
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
