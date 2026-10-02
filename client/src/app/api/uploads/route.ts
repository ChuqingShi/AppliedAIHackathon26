// A medical provider uploads a file for the firm (records, a bill, a letter).
// Only a signed-in provider may, and only to the case they're on: who they are and
// which provider they speak for come from their sign-in, never from the form.

import { loadCase } from "@/data/case";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, saveUpload } from "@/lib/uploads";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const account = await getSession();
  if (!account) return Response.json({ error: "Sign in to upload files" }, { status: 401 });
  if (account.role !== "provider") return Response.json({ error: "Only a medical provider can upload files here" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload" }, { status: 422 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "That file is larger than 20 MB" }, { status: 413 });
  if (!UPLOAD_TYPES.has(file.type)) return Response.json({ error: "Upload a PDF, an image (JPEG, PNG, HEIC, TIFF) or a Word document" }, { status: 415 });
  const note = String(form?.get("note") ?? "").trim().slice(0, 500) || null;

  const c = await loadCase();
  const provider = c.providers.find((p) => p.id === account.providerId);
  if (!provider) return Response.json({ error: "You're not a provider on this case" }, { status: 403 });

  const res = await saveUpload(c.id, file, { providerId: provider.id, providerName: provider.name, by: account.name }, note);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return Response.json({ error: body?.detail ?? "The upload didn't go through. Try again in a moment." }, { status: res.status });
  }
  return Response.json(await res.json());
}
