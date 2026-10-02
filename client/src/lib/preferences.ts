// What each user has changed about their own dashboard. It is kept under their
// account in the Sapini backend's database (not in Clio, which is read-only),
// so it is the same on every computer they sign in on.

import "server-only";
import type { OverviewLayout, TileSize } from "@/data/types";
import { saved } from "./store";

const pathFor = (accountId: string) => `/users/${encodeURIComponent(accountId)}/overview`;

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
// A user who has never changed theirs gets the default overview.
export async function getOverviewLayout(accountId: string): Promise<OverviewLayout> {
  return cleanLayout(await saved(pathFor(accountId)));
}

export async function setOverviewLayout(accountId: string, layout: unknown) {
  await saved(pathFor(accountId), cleanLayout(layout));
}
