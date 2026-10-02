"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Dashboard } from "@/data/types";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { FirmOnly, Rich, money } from "./ui";

const SUGGESTED = ["What changed this week?", "How far apart are we?", "What's still missing?", "What's due next?"];
const HINT_MS = 3200;

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
      { label: c.client.name, sub: `Client · ${c.client.phone}`, go: "client", icon: "user" },
      { label: "Offer, demand and target range", sub: "Financials", go: "financials", icon: "dollar" },
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

// What the box can take, shown in turn as its placeholder. The examples are
// taken from the signed-in role's own record.
function hints(d: Dashboard): string[] {
  const like = (what: string, example?: string) => (example ? `${what}, like “${example}”` : null);
  const all = d.role === "firm" ? [
    like("Search documents", d.case.documents[0]?.name),
    like("Ask a question", SUGGESTED[1]),
    like("Find a medical provider", d.case.providers[0]?.name),
    like("Search to-dos", d.case.tasks[0]?.title),
    like("Ask the assistant", SUGGESTED[0]),
    like("Look up an update", d.case.updates[0]?.firm.t),
    like("Search by person", d.case.client.name),
  ] : d.role === "provider" ? [
    like("Search your documents", d.case.documents[0]?.name),
    like("Look up an update", d.case.updates[0]?.t),
    like("Find someone on the legal team", d.case.team[0]?.name),
    like("Search the injuries on this case", d.case.injuries[0]?.name),
  ] : [];
  const usable = all.filter((h): h is string => h !== null);
  return usable.length ? usable : ["Search this case"];
}

// The one box in the top bar, for searching the case and (for the firm) asking
// the assistant. Two dropdowns open under it while there is something typed:
// matches in the case on the left, the assistant on the right. They close on
// Escape or a click elsewhere.
export function SearchBar() {
  const { dashboard, chat, thinking, ask } = useApp();
  const canAsk = dashboard.role === "firm";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const showing = open && q !== "";
  const index = useMemo(() => searchIndex(dashboard), [dashboard]);
  const hits = index.filter((x) => (x.label + " " + x.sub).toLowerCase().includes(q.toLowerCase()));
  const lastAsked = chat.findLast((m) => m.me)?.text;

  // The placeholder moves on to the next hint while the box is empty.
  const tips = useMemo(() => hints(dashboard), [dashboard]);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (query || tips.length < 2) return;
    const timer = setInterval(() => setTip((n) => (n + 1) % tips.length), HINT_MS);
    return () => clearInterval(timer);
  }, [query, tips.length]);

  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [chat, thinking, showing]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canAsk && q) ask(q);
    setOpen(true);
  }

  // Following a result leaves the search behind.
  function leave() {
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="searchbar" ref={box}>
      <form className="ask" onSubmit={submit}>
        <Icon name="search" />
        <div className="field">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            aria-label={canAsk ? "Search or ask about this case" : "Search this case"}
            autoComplete="off"
          />
          {!query && <span className="ph" key={tip} aria-hidden="true">{tips[tip % tips.length]}</span>}
        </div>
        {canAsk && <button aria-label="Ask the assistant" title="Ask the assistant"><Icon name="spark" /></button>}
      </form>
      {showing && (
        <div className="drops">
          <div className="drop">
            <div className="hd"><h3>In this case</h3><span className="muted">{hits.length} {hits.length === 1 ? "match" : "matches"}</span></div>
            <div className="hits">
              {hits.length
                ? hits.map((h, i) => (
                  <Link key={i} href={`/${h.go}`} className="row r-doc" onClick={leave}>
                    <Icon name={h.icon} /><div>{h.label}<small>{h.sub}</small></div><span className="link">Open</span>
                  </Link>
                ))
                : <div className="empty">Nothing on this case matches that search.</div>}
            </div>
          </div>
          {canAsk && (
            <div className="drop">
              <div className="hd"><h3>Assistant</h3><FirmOnly /></div>
              <div className="log" ref={log} aria-live="polite">
                {chat.map((m, i) => <div key={i} className={m.me ? "bubble me" : "bubble"}><Rich text={m.text} /></div>)}
                {thinking && <div className="bubble wait">Looking at the case…</div>}
              </div>
              {q !== lastAsked && <button className="asknow" onClick={() => ask(q)}><Icon name="spark" sm /><span>Press Enter to ask “{q}”</span></button>}
              <div className="chips">{SUGGESTED.map((s) => <button key={s} onClick={() => { setQuery(s); ask(s); }}>{s}</button>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
