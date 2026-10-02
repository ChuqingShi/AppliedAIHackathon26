// The patient's portrait (the face cut from their photo ID by the backend) for the
// signed-in firm user or medical provider. It takes no id: the server finds the
// photo ID on the signed-in user's case, so a provider can't ask for any other
// document, and only ever gets the face, never the ID itself. The client and
// signed-out visitors are refused.

import { loadCase } from "@/data/case";
import { getSession } from "@/lib/session";

const API = process.env.SAPINI_API_URL ?? "http://127.0.0.1:8000";

export async function GET() {
  const account = await getSession();
  if (!account) return new Response("Sign in to see this", { status: 401 });
  if (account.role !== "firm" && account.role !== "provider") return new Response("Not available", { status: 403 });

  const { photoIdDoc } = await loadCase();
  if (photoIdDoc == null) return new Response("No photo on file", { status: 404 });

  let res: Response;
  try {
    // face_only: if no face is found, nothing rather than the whole ID card
    res = await fetch(`${API}/documents/${photoIdDoc}/photo?face_only=true`, { cache: "no-store" });
  } catch {
    return new Response(`The Sapini backend isn't answering at ${API}`, { status: 502 });
  }
  if (!res.ok) return new Response(await res.text(), { status: res.status });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
