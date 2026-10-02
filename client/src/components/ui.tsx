"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { StatusKind } from "@/data/types";
import { Icon } from "./Icon";

export { billsTotal, money, moneyK } from "./format";

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
