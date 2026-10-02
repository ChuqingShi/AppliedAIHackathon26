// Opens a file a medical provider uploaded. The firm may open any upload on its
// case (and opening it marks it seen); a provider only the ones they uploaded
// themselves; the client none.

import { loadCase } from "@/data/case";
import { getUpload, uploadFile } from "@/lib/uploads";
import { getSession } from "@/lib/session";

export async function GET(_req: Request, { params }: RouteContext<"/api/uploads/[id]">) {
  const account = await getSession();
  if (!account) return new Response("Sign in to open files", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  const upload = await getUpload(id);
  const c = await loadCase();
  // Not on this case, or not theirs to open: answer as if it didn't exist.
  const allowed = upload && upload.caseId === c.id && (
    account.role === "firm" || (account.role === "provider" && upload.provider.id === account.providerId));
  if (!allowed) return new Response("Not found", { status: 404 });

  const res = await uploadFile(id, account.role === "firm");
  if (!res.ok) return new Response("That file is missing", { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      ...(res.headers.get("Content-Disposition") ? { "Content-Disposition": res.headers.get("Content-Disposition")! } : {}),
      // private: these are medical records
      "Cache-Control": "private, no-store",
    },
  });
}
