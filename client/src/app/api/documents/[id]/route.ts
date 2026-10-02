// Opens a synced case document (GET /documents/{id} on the backend). Firm only:
// documents include medical records and the client's photo ID, so this checks
// who is signed in before fetching anything, unlike a plain proxy would.

import { firmDocument } from "../firm-document";

export async function GET(_req: Request, { params }: RouteContext<"/api/documents/[id]">) {
  return firmDocument((await params).id, "");
}
