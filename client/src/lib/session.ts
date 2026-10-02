// Who is signed in. Demo auth: the cookie just names one of the accounts in
// src/data/accounts.ts. When the backend has real login, keep its session token
// in this cookie instead and look the user up there.

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findAccount } from "@/data/accounts";

const COOKIE = "caseboard_session";
const WEEK = 60 * 60 * 24 * 7;

export const getSession = cache(async () => {
  const id = (await cookies()).get(COOKIE)?.value;
  return (await findAccount(id)) ?? null;
});

// For anything behind the login: returns the account, or sends the visitor to /login.
export async function requireSession() {
  return (await getSession()) ?? redirect("/login");
}

export async function createSession(accountId: string) {
  (await cookies()).set(COOKIE, accountId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: WEEK,
    path: "/",
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}
