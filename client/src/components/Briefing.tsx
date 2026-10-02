"use client";

// The briefing that pops up over the firm's overview after sign-in: what needs
// attention, what's due next, what happened lately and the case's key dates,
// so the important things are the first thing seen. It is built from the same
// record as the overview (the alerts are the "Needs attention" strip's), so the
// two always agree. Closing it is final until the next sign-in.

import { useEffect } from "react";
import { CaseStatusBadge, useApp, useFirmCase } from "./AppShell";
import { attention } from "./firm-cards";
import { Icon } from "./Icon";
import { Go } from "./ui";

export function Briefing() {
  const { briefingOpen, closeBriefing, dashboard } = useApp();
  const c = useFirmCase();

  useEffect(() => {
    if (!briefingOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeBriefing(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [briefingOpen, closeBriefing]);

  if (!briefingOpen) return null;

  const alerts = attention(c);
  const due = c.tasks.slice(0, 3);
  const recent = c.updates.slice(0, 3);
  const d = c.deadline;
  const firstName = dashboard.user.name.split(" ")[0];

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeBriefing(); }}>
      {/* Following any link in here (an alert, "All to-dos") also closes it. */}
      <div className="dialog brief" role="dialog" aria-modal="true" aria-labelledby="brief-title"
        onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) closeBriefing(); }}>
        <div className="brief-hd">
          <div>
            <h3 id="brief-title">Welcome back, {firstName}</h3>
            <small>{c.title} · {c.stages[c.stageIndex].name}</small>
          </div>
          <button className="x" aria-label="Close" onClick={closeBriefing}>×</button>
        </div>

        <section>
          <h4>Needs attention</h4>
          <div className="alerts">
            {alerts.length
              ? alerts.map((a) => <Go key={a.text} to={a.to} className="alert"><Icon name="bang" sm />{a.text}</Go>)
              : <span className="alert ok"><Icon name="check" sm />Nothing needs attention right now</span>}
          </div>
        </section>

        {due.length > 0 && (
          <section>
            <h4>Due next</h4>
            {due.map((t) => (
              <div className="brief-row" key={t.title}>
                <span>{t.title}</span>
                <span className={t.daysLeft != null && t.daysLeft < 0 ? "late" : "ink2"}>
                  {t.daysLeft != null && t.daysLeft < 0 ? `Overdue · ${t.due}` : t.due}
                </span>
              </div>
            ))}
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h4>Latest activity</h4>
            {recent.map((u, i) => (
              <div className="brief-row" key={i}><span>{u.firm.t}</span><span className="ink2">{u.date}</span></div>
            ))}
          </section>
        )}

        <section className="brief-dates">
          <span>Opened <b>{c.dates.opened ?? "—"}</b></span>
          <CaseStatusBadge closed={c.dates.closed} />
          <span>Statute of limitations <b>{d ? `${d.date}${d.met ? " · met" : d.daysLeft >= 0 ? ` · ${d.daysLeft} days left` : " · passed"}` : "not set"}</b></span>
        </section>

        <div className="rw">
          <Go to="todo" className="btn ghost">All to-dos</Go>
          <button className="btn" onClick={closeBriefing} autoFocus>Go to overview</button>
        </div>
      </div>
    </div>
  );
}
