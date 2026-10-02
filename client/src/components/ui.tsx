"use client";

import Link from "next/link";
import { useState } from "react";
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
export function PhotoIdThumb({ docId, name, size, fallback = null }: { docId: number; name: string; size: "sm" | "lg"; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return (
    <a className={`idphoto ${size}`} href={`/api/documents/${docId}`} target="_blank" rel="noreferrer" title="From the photo ID on file: click to open it">
      {/* A plain img, not next/image: the optimizer would keep a cached copy of an identity document. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/documents/${docId}/photo`} alt={`${name}, from the photo ID on file`} onError={() => setFailed(true)} />
    </a>
  );
}
