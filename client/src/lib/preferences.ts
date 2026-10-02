// What each user has changed about their own dashboard. It is kept under their
// account in the Sapini backend's database (not in Clio, which is read-only),
// so it is the same on every computer they sign in on.

import "server-only";
import { API } from "@/data/case";
import type { OverviewLayout, TileSize } from "@/data/types";

// Reads the account's saved overview from the backend, or with `save` replaces it.
async function overviewRequest(accountId: string, save?: OverviewLayout): Promise<unknown> {
  const path = `/users/${encodeURIComponent(accountId)}/overview`;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, save
      ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(save) }
      : { cache: "no-store" });
  } catch {
    throw new Error(`The Sapini backend isn't answering at ${API}. Start it with: uvicorn main:app --port 8000`);
  }
  // Not a reason to show the default overview: the next change would then be saved over the user's own.
  if (!res.ok) throw new Error(`The backend returned ${res.status} for ${path}. If it has been running since before it kept overview layouts, restart it.`);
  return res.json();
}

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
  return cleanLayout(await overviewRequest(accountId));
}

export async function setOverviewLayout(accountId: string, layout: unknown) {
  await overviewRequest(accountId, cleanLayout(layout));
}
