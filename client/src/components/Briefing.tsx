"use client";

// The briefing that pops up over the overview after sign-in, so the important
// things are the first thing seen. The firm and medical providers each get their
// own, built from the record their role was given (a provider's can only show
// what the server already trimmed for them). Closing it is final until the next
// sign-in; the sidebar's "Today's briefing" button brings it back any time.

import { useEffect } from "react";
import type { ReactNode } from "react";
import { CaseStatusBadge, useApp, useFirmCase, useProviderCase } from "./AppShell";
import { attention } from "./firm-cards";
import { unanswered } from "./format";
import { Icon } from "./Icon";
import { Go, money } from "./ui";

// The window both briefings share: closes on ×, Escape, a click outside it, or
// following any link inside it.
function BriefingDialog({ title, subtitle, actions, children }: { title: string; subtitle: string; actions: ReactNode; children: ReactNode }) {
  const { briefingOpen, closeBriefing } = useApp();

  useEffect(() => {
    if (!briefingOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeBriefing(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [briefingOpen, closeBriefing]);

  if (!briefingOpen) return null;
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeBriefing(); }}>
      <div className="dialog brief" role="dialog" aria-modal="true" aria-labelledby="brief-title"
        onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) closeBriefing(); }}>
        <div className="brief-hd">
          <div>
            <h3 id="brief-title">{title}</h3>
            <small>{subtitle}</small>
          </div>
          <button className="x" aria-label="Close" onClick={closeBriefing}>×</button>
        </div>
        {children}
        <div className="rw">
          {actions}
          <button className="btn" onClick={closeBriefing} autoFocus>Go to overview</button>
        </div>
      </div>
    </div>
  );
}

// Overdue or not, as the briefings word a due date.
function DueLabel({ due, daysLeft }: { due: string; daysLeft?: number | null }) {
  return daysLeft != null && daysLeft < 0
    ? <span className="late">Overdue · {due}</span>
    : <span className="ink2">{due}</span>;
}

// ---- The firm: what needs attention, what's due, the latest activity, key dates ----

export function Briefing() {
  const { dashboard } = useApp();
  const c = useFirmCase();
  // The alerts are the "Needs attention" strip's, so the two always agree.
  const alerts = attention(c, dashboard.inquiries, dashboard.role === "firm" ? dashboard.uploads : []);
  const due = c.tasks.slice(0, 3);
  const recent = c.updates.slice(0, 3);
  const d = c.deadline;

  return (
    <BriefingDialog
      title={`Welcome back, ${dashboard.user.name.split(" ")[0]}`}
      subtitle={`${c.title} · ${c.stages[c.stageIndex].name}`}
      actions={<Go to="todo" className="btn ghost">All to-dos</Go>}
    >
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
          {due.map((t) => <div className="brief-row" key={t.title}><span>{t.title}</span><DueLabel due={t.due} daysLeft={t.daysLeft} /></div>)}
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h4>Latest activity</h4>
          {recent.map((u, i) => <div className="brief-row" key={i}><span>{u.firm.t}</span><span className="ink2">{u.date}</span></div>)}
        </section>
      )}

      <section className="brief-dates">
        <span>Opened <b>{c.dates.opened ?? "—"}</b></span>
        <CaseStatusBadge closed={c.dates.closed} />
        <span>Statute of limitations <b>{d ? `${d.date}${d.met ? " · met" : d.daysLeft >= 0 ? ` · ${d.daysLeft} days left` : " · passed"}` : "not set"}</b></span>
      </section>
    </BriefingDialog>
  );
}

// ---- A medical provider: what the firm needs from them, their balance, the case's progress ----

export function ProviderBriefing() {
  const p = useProviderCase();
  const questions = unanswered(useApp().dashboard.inquiries);
  const stage = p.stages[p.stageIndex];
  const nextStage = p.stages[p.stageIndex + 1];
  const recent = p.updates.slice(0, 3);
  const contact = p.team.find((m) => m.main) ?? p.team[0];

  return (
    <BriefingDialog
      title="Welcome back"
      subtitle={`${p.provider.name} · ${p.patient.name}'s case`}
      actions={<>{questions.length > 0 && <Go to="questions" className="btn ghost">Answer questions</Go>}<Go to="records" className="btn ghost">Records &amp; bills</Go></>}
    >
      <section>
        <h4>Needed from you</h4>
        {questions.map((q) => (
          <div className="brief-row" key={q.id}>
            <span><b>Question from {q.from}</b><small className="ink2"> · {q.message.replace(/\s+/g, " ").slice(0, 70)}…</small></span>
            <span className="late">To answer</span>
          </div>
        ))}
        {p.requests.length || questions.length
          ? p.requests.map((r) => (
              <div className="brief-row" key={r.title}>
                <span><b>{r.title}</b>{r.detail && <small className="ink2"> · {r.detail}</small>}</span>
                <DueLabel due={r.due} daysLeft={r.daysLeft} />
              </div>
            ))
          : <div className="alerts"><span className="alert ok"><Icon name="check" sm />Nothing needed from you right now</span></div>}
      </section>

      <section>
        <h4>Your balance</h4>
        <div className="brief-row">
          <span><b>{money(p.lien)}</b> on this case</span>
          <span className="ink2">Paid when the case settles</span>
        </div>
      </section>

      <section>
        <h4>Where the case is</h4>
        <div className="brief-row">
          <span>Stage {p.stageIndex + 1} of {p.stages.length}: <b>{stage.name}</b></span>
          {nextStage && <span className="ink2">Next: {nextStage.name}</span>}
        </div>
        {recent.map((u, i) => <div className="brief-row" key={i}><span>{u.t}</span><span className="ink2">{u.date}</span></div>)}
      </section>

      {contact && (
        <section className="brief-dates">
          <span>Your contact at {p.firm}: <b>{contact.name}</b></span>
        </section>
      )}
    </BriefingDialog>
  );
}
