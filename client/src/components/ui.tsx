"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { StatusKind } from "@/data/case";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";

export { money, moneyK } from "./format";

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

// Link to another view of the current role. Also leaves search, like the nav does.
export function Go({ to, className = "link", children }: { to: string; className?: string; children: ReactNode }) {
  const { role, setQuery } = useApp();
  return <Link href={`/${role}/${to}`} className={className} onClick={() => setQuery("")}>{children}</Link>;
}
