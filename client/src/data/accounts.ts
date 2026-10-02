// Demo accounts, one per kind of user. Stand-ins until the backend has real
// users: signing in is just picking one of these.

import "server-only";
import type { User } from "./types";

export type Account =
  | (User & { role: "firm" })
  | (User & { role: "provider"; providerId: string })
  | (User & { role: "client" });

export const ACCOUNTS: Account[] = [
  { id: "dana", role: "firm", name: "Dana Whitfield", initials: "DW", title: "Lead attorney" },
  { id: "jenna", role: "provider", providerId: "summit", name: "Jenna Brooks", initials: "JB", title: "Summit Orthopedics · Billing" },
  { id: "maria", role: "client", name: "Maria Alvarez", initials: "MA", title: "Plaintiff" },
];

export const findAccount = (id: unknown) => ACCOUNTS.find((a) => a.id === id);
