// What the dashboard itself saves. It is kept in the Sapini backend's database
// (not in Clio, which is read-only), so it is the same for everyone on every
// computer they sign in on.

import "server-only";
import { API } from "@/data/case";

// Reads what is saved at `path` in the backend (null if nothing is), or with `save` replaces it.
export async function saved(path: string, save?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, save !== undefined
      ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(save) }
      : { cache: "no-store" });
  } catch {
    throw new Error(`The Sapini backend isn't answering at ${API}. Start it with: uvicorn main:app --port 8000`);
  }
  // Not a reason to carry on as if nothing were saved: the next change would then be saved over what is there.
  if (!res.ok) throw new Error(`The backend returned ${res.status} for ${path}. If it has been running since before it kept this, restart it.`);
  return res.json();
}
