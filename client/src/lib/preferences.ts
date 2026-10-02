// What each user has changed about their own dashboard. Demo storage: a cookie
// per account. When the backend has a database, keep these there instead (not
// in Clio, which is read-only).

import "server-only";
import { cookies } from "next/headers";
import type { OverviewLayout, TileSize } from "@/data/types";

const YEAR = 60 * 60 * 24 * 365;
const overviewCookie = (accountId: string) => `caseboard_overview_${accountId}`;

const TILE_ID = /^[a-z-]{1,40}$/;

function tileIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === "string" && TILE_ID.test(id));
  return [...new Set(ids)].slice(0, 40);
}

// Rows of tile ids, with no tile in two places.
function tileRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 40)
    .map((row) => tileIds(row).filter((id) => !seen.has(id) && Boolean(seen.add(id))))
    .filter((row) => row.length > 0);
}

// The size set on each resized tile.
function tileSizes(value: unknown): Record<string, TileSize> {
  const sizes: Record<string, TileSize> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return sizes;
  for (const [id, size] of Object.entries(value).slice(0, 40)) {
    if (TILE_ID.test(id) && (size === "s" || size === "m" || size === "l")) sizes[id] = size;
  }
  return sizes;
}

// Whatever was stored or sent, reduced to a well-formed layout.
function cleanLayout(value: unknown): OverviewLayout {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { removed: tileIds(v.removed), added: tileIds(v.added), rows: tileRows(v.rows), sizes: tileSizes(v.sizes), locked: tileIds(v.locked) };
}

// The tiles this user has taken off and put on their overview, and how they arranged, sized and locked them.
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
