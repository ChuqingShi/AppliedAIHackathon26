// Shared by the document routes: fetch a document (or its picture) from the
// backend for a signed-in firm user, and refuse everyone else.

import "server-only";
import { getSession } from "@/lib/session";

const API = process.env.SAPINI_API_URL ?? "http://127.0.0.1:8000";

export async function firmDocument(id: string, suffix: "" | "/image") {
  const account = await getSession();
  if (!account) return new Response("Sign in to open documents", { status: 401 });
  if (account.role !== "firm") return new Response("Only the law firm can open case documents", { status: 403 });
  if (!/^\d+$/.test(id)) return new Response("Not found", { status: 404 });

  const res = await fetch(`${API}/documents/${id}${suffix}`, { cache: "no-store" });
  if (!res.ok) return new Response(await res.text(), { status: res.status });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      ...(res.headers.get("Content-Disposition") ? { "Content-Disposition": res.headers.get("Content-Disposition")! } : {}),
      // private: these can be identity or medical documents
      "Cache-Control": "private, no-store",
    },
  });
}
