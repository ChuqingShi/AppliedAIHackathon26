// What each user has changed about their own dashboard. Demo storage: a cookie
// per account. When the backend has a database, keep these there instead (not
// in Clio, which is read-only).

import "server-only";
import { cookies } from "next/headers";

const YEAR = 60 * 60 * 24 * 365;
const hiddenTilesCookie = (accountId: string) => `caseboard_hidden_tiles_${accountId}`;

// The overview tiles this user has removed, by tile id.
export async function getHiddenTiles(accountId: string): Promise<string[]> {
  const value = (await cookies()).get(hiddenTilesCookie(accountId))?.value;
  return value ? value.split(",") : [];
}

export async function setHiddenTiles(accountId: string, ids: string[]) {
  (await cookies()).set(hiddenTilesCookie(accountId), ids.join(","), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: YEAR,
    path: "/",
  });
}
