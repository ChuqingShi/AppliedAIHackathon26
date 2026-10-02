// The briefing that pops up over the firm's overview right after sign-in.
// Signing in leaves a short-lived cookie saying it hasn't been seen yet; closing
// the briefing clears it, so a refresh doesn't bring it back but the next
// sign-in does.

import "server-only";
import { cookies } from "next/headers";

const COOKIE = "caseboard_briefing";
const DAY = 60 * 60 * 24;

export async function queueBriefing() {
  (await cookies()).set(COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DAY,
    path: "/",
  });
}

export async function briefingPending() {
  return (await cookies()).get(COOKIE)?.value === "1";
}

export async function clearBriefing() {
  (await cookies()).delete(COOKIE);
}
