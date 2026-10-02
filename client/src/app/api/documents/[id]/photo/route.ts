// Just the portrait from the client's photo ID (GET /documents/{id}/photo on the
// backend), for the Client card and the sidebar. Firm only, like the document itself.

import { firmDocument } from "../../firm-document";

export async function GET(_req: Request, { params }: RouteContext<"/api/documents/[id]/photo">) {
  return firmDocument((await params).id, "/photo");
}
