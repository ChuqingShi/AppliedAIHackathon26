"use client";

import type { Dashboard } from "@/data/types";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Go, money } from "./ui";

interface Hit { label: string; sub: string; go: string; icon: IconName }

// Search only looks at the record the signed-in role was given.
function searchIndex(d: Dashboard): Hit[] {
  if (d.role === "firm") {
    const c = d.case;
    return [
      ...c.documents.map((doc) => ({ label: doc.name, sub: `Document · ${doc.kind} · ${doc.date}`, go: "documents", icon: "doc" as const })),
      ...c.tasks.map((t) => ({ label: t.title, sub: `To-do · ${t.who} · ${t.due}`, go: "todo", icon: "task" as const })),
      ...c.providers.map((p) => ({ label: p.name, sub: `Medical provider · ${money(p.billed)}`, go: "providers", icon: "users" as const })),
      ...c.updates.map((u) => ({ label: u.firm.t, sub: `Update · ${u.date}`, go: "updates", icon: "clock" as const })),
      { label: c.client.name, sub: c.client.phone ? `Client · ${c.client.phone}` : "Client", go: "client", icon: "user" },
      { label: "Case value, policy limit and medical bills", sub: "Financials", go: "financials", icon: "dollar" },
    ];
  }
  if (d.role === "provider") {
    const p = d.case;
    return [
      ...p.documents.map((doc) => ({ label: doc.name, sub: `Document · ${doc.date}`, go: "records", icon: "doc" as const })),
      ...p.updates.map((u) => ({ label: u.t, sub: `Update · ${u.date}`, go: "progress", icon: "clock" as const })),
      ...p.team.map((m) => ({ label: m.name, sub: `Legal team · ${m.role}`, go: "team", icon: "users" as const })),
      ...p.injuries.map((j) => ({ label: j.name, sub: `Injury · ${j.status}`, go: "patient", icon: "user" as const })),
    ];
  }
  return [];
}

export function SearchResults() {
  const { dashboard, query } = useApp();
  const q = query.trim().toLowerCase();
  const hits = searchIndex(dashboard).filter((x) => (x.label + " " + x.sub).toLowerCase().includes(q));
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
