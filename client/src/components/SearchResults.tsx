"use client";

import { CASE, P } from "@/data/case";
import type { Role } from "@/data/nav";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Go, money } from "./ui";

interface Hit { label: string; sub: string; go: string; icon: IconName }

// Search only looks at what the current role is allowed to see.
function searchIndex(role: Role): Hit[] {
  if (role === "firm") {
    return [
      ...CASE.documents.map((d) => ({ label: d.name, sub: `Document · ${d.kind} · ${d.date}`, go: "documents", icon: "doc" as const })),
      ...CASE.tasks.map((t) => ({ label: t.title, sub: `To-do · ${t.who} · ${t.due}`, go: "todo", icon: "task" as const })),
      ...CASE.providers.map((p) => ({ label: p.name, sub: `Medical provider · ${money(p.billed)}`, go: "providers", icon: "users" as const })),
      ...CASE.updates.map((u) => ({ label: u.firm.t, sub: `Update · ${u.date}`, go: "updates", icon: "clock" as const })),
      { label: CASE.client.name, sub: `Client · ${CASE.client.phone}`, go: "client", icon: "user" },
      { label: "Offer, demand and target range", sub: "Financials", go: "financials", icon: "dollar" },
    ];
  }
  return [
    ...P.documents.map((d) => ({ label: d.name, sub: `Document · ${d.date}`, go: "records", icon: "doc" as const })),
    ...P.updates.map((u) => ({ label: u.t, sub: `Update · ${u.date}`, go: "progress", icon: "clock" as const })),
    ...P.team.map((m) => ({ label: m.name, sub: `Legal team · ${m.role}`, go: "team", icon: "users" as const })),
    ...P.injuries.map((j) => ({ label: j.name, sub: `Injury · ${j.status}`, go: "patient", icon: "user" as const })),
  ];
}

export function SearchResults() {
  const { role, query } = useApp();
  const q = query.trim().toLowerCase();
  const hits = searchIndex(role).filter((x) => (x.label + " " + x.sub).toLowerCase().includes(q));
  return (
    <>
      <h2>Results for “{query.trim()}”</h2>
      <div className="card">
        {hits.length
          ? hits.map((h, i) => (
            <Go key={i} to={h.go} className="row r-doc">
              <Icon name={h.icon} /><div>{h.label}<small>{h.sub}</small></div><span className="link">Open</span>
            </Go>
          ))
          : <div className="empty">Nothing on this case matches that search.</div>}
      </div>
    </>
  );
}
