// What the client has changed about their own details. Clio is read-only, so
// the changes are kept per case in the Sapini backend's database and laid over
// what Clio has: the firm and the providers see them too, wherever they sign
// in, and one case's changes never show on another.

import "server-only";
import { DETAILS } from "@/data/details";
import type { DetailField } from "@/data/details";
import type { Case, ClientDetails, DetailErrors } from "@/data/types";
import { saved } from "./store";

// The case id is the matter's display number, which may contain a slash; the backend's route allows for that.
const pathFor = (caseId: string) => `/cases/${caseId.split("/").map(encodeURIComponent).join("/")}/client-details`;

type ClientEdits = ClientDetails & { updated: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Today as YYYY-MM-DD, in the server's time zone.
const today = () => new Date().toLocaleDateString("en-CA");
// A real day on the calendar (so not Feb 31).
const isDay = (value: unknown): value is string =>
  typeof value === "string" && DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

function problem(type: DetailField["type"], value: string): string | undefined {
  switch (type) {
    case "date": return isDay(value) && value >= "1900-01-01" && value <= today() ? undefined : "Enter a valid date of birth";
    case "tel": return /^[\d\s()+.x-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 ? undefined : "Enter a valid phone number";
    case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : "Enter a valid email address";
  }
}

// Whatever was sent or stored, checked field by field against DETAILS.
export function checkDetails(read: (key: keyof ClientDetails) => unknown): { details: ClientDetails } | { errors: DetailErrors } {
  const details = {} as ClientDetails;
  const errors: DetailErrors = {};
  for (const f of DETAILS) {
    const raw = read(f.key);
    const value = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    details[f.key] = value;
    const error = !value ? "This can’t be left empty" : value.length > f.max ? `Keep this to ${f.max} characters` : problem(f.type, value);
    if (error) errors[f.key] = error;
  }
  return Object.keys(errors).length ? { errors } : { details };
}

// The client's own changes, or null if they have made none.
export async function getClientEdits(caseId: string): Promise<ClientEdits | null> {
  const stored = await saved(pathFor(caseId));
  if (!stored || typeof stored !== "object") return null;
  const edits = stored as Record<string, unknown>;
  const checked = checkDetails((key) => edits[key]);
  return "details" in checked && isDay(edits.updated) ? { ...checked.details, updated: edits.updated } : null;
}

export async function setClientEdits(caseId: string, details: ClientDetails) {
  const edits: ClientEdits = { ...details, updated: today() };
  await saved(pathFor(caseId), edits);
}

function initials(name: string) {
  const words = name.split(" ").map((word) => [...word][0]);
  return (words.length > 1 ? words[0] + words[words.length - 1] : words[0]).toUpperCase();
}

function age(dob: string) {
  const now = today();
  const years = Number(now.slice(0, 4)) - Number(dob.slice(0, 4));
  return now.slice(5) < dob.slice(5) ? years - 1 : years;
}

// The case with the client's changes laid over what the firm had, so every
// role's record is built from the same, current details.
export function withClientEdits(c: Case, edits: ClientEdits | null): Case {
  if (!edits) return c;
  return { ...c, client: { ...c.client, ...edits, initials: initials(edits.name), age: age(edits.dob) } };
}
