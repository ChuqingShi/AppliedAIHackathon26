// Server-side loader for the case record. Runs in the Next.js server, so the
// browser never talks to the backend directly.

import type { Role } from "./nav";
import type { Case, ProviderCase } from "./case";

export type CaseData = { role: "firm"; case: Case } | { role: "provider"; case: ProviderCase };

const API = process.env.SAPINI_API_URL ?? "http://127.0.0.1:8000";

export async function loadCase(role: Role): Promise<CaseData> {
  const params = new URLSearchParams();
  if (process.env.SAPINI_MATTER_ID) params.set("matter_id", process.env.SAPINI_MATTER_ID);
  if (role === "provider" && process.env.SAPINI_PROVIDER_ID) params.set("provider_id", process.env.SAPINI_PROVIDER_ID);
  const path = role === "firm" ? "/case" : "/case/provider";
  const qs = params.size ? `?${params}` : "";

  // no-store: always show what is in the backend now, never a cached copy
  const res = await fetch(`${API}${path}${qs}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Backend returned ${res.status} for ${path}`);
  }
  return { role, case: await res.json() } as CaseData;
}
