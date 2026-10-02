// What each user has changed about their own dashboard. Demo storage: a cookie
// per account. When the backend has a database, keep these there instead (not
// in Clio, which is read-only).

import "server-only";
import { cookies } from "next/headers";
import type { OverviewLayout } from "@/data/types";

const YEAR = 60 * 60 * 24 * 365;
const overviewCookie = (accountId: string) => `caseboard_overview_${accountId}`;

function tileIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && /^[a-z-]{1,40}$/.test(id));
  return [...new Set(ids)].slice(0, 40);
}

// Whatever was stored or sent, reduced to a well-formed layout.
function cleanLayout(value: unknown): OverviewLayout {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { removed: tileIds(v.removed), added: tileIds(v.added) };
}

// The tiles this user has taken off and put on their overview.
export async function getOverviewLayout(accountId: string): Promise<OverviewLayout> {
  const value = (await cookies()).get(overviewCookie(accountId))?.value;
  try {
    return cleanLayout(value ? JSON.parse(value) : null);
  } catch {
    return cleanLayout(null);
  }
}

export async function setOverviewLayout(accountId: string, layout: unknown) {
  (await cookies()).set(overviewCookie(accountId), JSON.stringify(cleanLayout(layout)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: YEAR,
    path: "/",
  });
}
