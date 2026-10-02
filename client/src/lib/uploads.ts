// Files medical providers upload for the firm. They are kept in the Sapini
// backend (Clio is read-only). Who may upload and open what is decided by the
// routes that call these (src/app/api/uploads/).

import "server-only";
import { API } from "@/data/case";
import type { Upload } from "@/data/types";

// What a provider may upload: the same limits the backend enforces, checked here
// first so a bad file gets a clear message before it is sent anywhere.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const UPLOAD_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/heic", "image/tiff",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function backend(path: string, init?: RequestInit) {
  try {
    return await fetch(`${API}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new Error(`The Sapini backend isn't answering at ${API}. Start it with: uvicorn main:app --port 8000`);
  }
}

// Every file uploaded on the case, newest first.
export async function getUploads(caseId: string): Promise<Upload[]> {
  const res = await backend(`/cases/${encodeURIComponent(caseId)}/uploads`);
  if (!res.ok) throw new Error(`The backend returned ${res.status} for uploads. If it has been running since before it kept uploads, restart it.`);
  return res.json();
}

export async function saveUpload(caseId: string, file: File, from: { providerId: string; providerName: string; by: string }, note: string | null) {
  const q = new URLSearchParams({
    provider_id: from.providerId, provider_name: from.providerName, uploaded_by: from.by,
    file_name: file.name, content_type: file.type,
    ...(note ? { note } : {}),
  });
  return backend(`/cases/${encodeURIComponent(caseId)}/uploads?${q}`, { method: "POST", body: await file.arrayBuffer() });
}

// One upload's details, including which case it belongs to (null if there's no such upload).
export async function getUpload(id: number): Promise<(Upload & { caseId: string }) | null> {
  const res = await backend(`/uploads/${id}`);
  return res.ok ? res.json() : null;
}

export async function uploadFile(id: number, openedByFirm: boolean) {
  return backend(`/uploads/${id}/file${openedByFirm ? "?opened_by_firm=true" : ""}`);
}
