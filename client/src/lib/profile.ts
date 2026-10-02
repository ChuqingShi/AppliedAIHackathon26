// What the client has changed about their own details. Demo storage: one cookie
// per case, so the firm and the providers see the change too when the demo
// switches account, and one case's changes never show on another. When the backend has a database, keep these there instead
// (not in Clio, which is read-only).

import "server-only";
import { cookies } from "next/headers";
import { DETAILS } from "@/data/details";
import type { DetailField } from "@/data/details";
import type { Case, ClientDetails, DetailErrors } from "@/data/types";

const YEAR = 60 * 60 * 24 * 365;
const cookieFor = (caseId: string) => `caseboard_client_details_${caseId.replace(/[^\w-]/g, "")}`;

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
  const value = (await cookies()).get(cookieFor(caseId))?.value;
  try {
    const stored = value ? JSON.parse(value) : null;
    if (!stored || typeof stored !== "object") return null;
    const checked = checkDetails((key) => stored[key]);
    return "details" in checked && isDay(stored.updated) ? { ...checked.details, updated: stored.updated } : null;
  } catch {
    return null;
  }
}

export async function setClientEdits(caseId: string, details: ClientDetails) {
  const edits: ClientEdits = { ...details, updated: today() };
  (await cookies()).set(cookieFor(caseId), JSON.stringify(edits), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: YEAR,
    path: "/",
  });
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
