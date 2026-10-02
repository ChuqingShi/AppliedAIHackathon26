"use client";

import Link from "next/link";
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

// The client's photo ID on file, as a small thumbnail that opens the full document.
// Firm only: only the firm's record carries photoIdDoc, and the document routes
// (src/app/api/documents/) refuse anyone else.
export function PhotoIdThumb({ docId, name, compact }: { docId: number; name: string; compact?: boolean }) {
  return (
    <a className={compact ? "idthumb sm" : "idthumb"} href={`/api/documents/${docId}`} target="_blank" rel="noreferrer" title="Open the photo ID on file">
      {/* A plain img, not next/image: the optimizer would keep a cached copy of an identity document. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/documents/${docId}/image`} alt={`Photo ID on file for ${name}`} />
      {!compact && <small>Photo ID</small>}
    </a>
  );
}
