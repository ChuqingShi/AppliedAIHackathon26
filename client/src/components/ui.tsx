"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { StatusKind } from "@/data/types";
import { Icon } from "./Icon";

export { billsTotal, day, money, moneyK } from "./format";

export function Status({ kind, label }: { kind: StatusKind; label: string }) {
  return (
    <span className={`st ${kind}`}>
      <span className="dot"><Icon name={kind === "good" ? "check" : "bang"} /></span>
      {label}
    </span>
  );
}

export function FirmOnly() {
  return <span className="tag firm"><Icon name="lock" sm />Firm only</span>;
}

// Link to another view of the dashboard.
export function Go({ to, className = "link", children }: { to: string; className?: string; children: ReactNode }) {
  return <Link href={`/${to}`} className={className}>{children}</Link>;
}

// Text with **bold** marks, as the assistant writes it.
export function Rich({ text }: { text: string }) {
  return text.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

// The client's portrait, cut from the photo ID on file (the backend finds the face
// on the card): a small passport-style photo that opens the full ID when clicked.
// `size` is "sm" in the sidebar's client block above the case, "lg" in place of the
// initials on the Client card.
// If the picture can't be loaded (the backend is restarting, say), it shows
// `fallback` instead (the initials on the Client card; nothing in the sidebar)
// rather than a broken image.
// Firm only: only the firm's record carries photoIdDoc, and the document routes
// (src/app/api/documents/) refuse anyone else.
// Whether a photo failed to load, for hiding it. onError alone misses a picture that
// failed before the page came alive in the browser (it's rendered on the server first),
// so the ref also checks, once mounted, whether it has already given up.
function usePhotoFailed() {
  const [failed, setFailed] = useState(false);
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  return { failed, ref, onError: () => setFailed(true) };
}

// The patient's portrait for a medical provider: the same face crop, but not a link,
// and fetched by case rather than by document, so a provider never learns the ID
// document's id or opens the ID itself (see src/app/api/patient-photo/route.ts).
export function PatientPhoto({ name, size, fallback = null }: { name: string; size: "sm" | "lg"; fallback?: ReactNode }) {
  const { failed, ref, onError } = usePhotoFailed();
  if (failed) return fallback;
  return (
    <span className={`idphoto ${size}`}>
      {/* A plain img, not next/image: the optimizer would keep a cached copy of the photo. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src="/api/patient-photo" alt={`${name}`} onError={onError} />
    </span>
  );
}

export function PhotoIdThumb({ docId, name, size, fallback = null }: { docId: number; name: string; size: "sm" | "lg"; fallback?: ReactNode }) {
  const { failed, ref, onError } = usePhotoFailed();
  if (failed) return fallback;
  return (
    <a className={`idphoto ${size}`} href={`/api/documents/${docId}`} target="_blank" rel="noreferrer" title="From the photo ID on file: click to open it">
      {/* A plain img, not next/image: the optimizer would keep a cached copy of an identity document. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={`/api/documents/${docId}/photo`} alt={`${name}, from the photo ID on file`} onError={onError} />
    </a>
  );
}
