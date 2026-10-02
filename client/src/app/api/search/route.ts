// The document pages that match what is typed in the search box. A route handler
// rather than a server action, so a search isn't queued behind a question the
// assistant is still answering.

import { findPages } from "@/lib/passages";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  // Every document on the case is searched, so this is for the firm only. The
  // search box is the same for a medical provider and the client, but theirs
  // never reads what a document says: the client isn't given the case file, and
  // its pages carry the personal details a provider isn't given.
  if ((await getSession())?.role !== "firm") return Response.json([], { status: 403 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json(await findPages(q.slice(0, 2000)));
}
