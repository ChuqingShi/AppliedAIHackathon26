// A synced case document as a picture (GET /documents/{id}/image on the backend),
// for the photo ID thumbnail on the Client card. Firm only, like the document itself.

import { firmDocument } from "../../firm-document";

export async function GET(_req: Request, { params }: RouteContext<"/api/documents/[id]/image">) {
  return firmDocument((await params).id, "/image");
}
