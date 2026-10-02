"use client";

import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import type { Case, CaseUpdate, Injury } from "@/data/case";
import { useApp } from "./AppShell";
import { SUGGESTED } from "./assistant";
import { useFirmCase } from "./CaseData";
import { Icon } from "./Icon";
import { FirmOnly, Go, Status, money, moneyK } from "./ui";

export function InjuriesList({ injuries, withProvider }: { injuries: Injury[]; withProvider?: boolean }) {
  if (!injuries.length) return <p className="ink2" style={{ fontSize: 13 }}>No injuries recorded.</p>;
  return injuries.map((j) => (
    <div className="inj" key={j.name}><div>{j.name}<small>{j.status}{withProvider && j.by ? ` · treated by ${j.by}` : ""}</small></div></div>
  ));
}

export function CardAssistant() {
  const { chat, ask } = useApp();
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [chat]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
    ask(input.value);
    input.value = "";
  }

  return (
    <div className="card ai">
      <div className="hd"><h3><Icon name="spark" /> Ask about this case</h3><FirmOnly /></div>
      <div className="log" ref={log}>
        {chat.map((m, i) => <div key={i} className={m.me ? "bubble me" : "bubble"}>{m.body}</div>)}
      </div>
      <div className="chips">{SUGGESTED.map((q) => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div>
      <form className="ask" onSubmit={submit}>
        <input name="q" placeholder="Ask anything about this case" autoComplete="off" />
        <button aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  );
}

// The money figures this case actually has, smallest first. Clio holds no
// structured offer or demand for most matters, so those only appear when set.
function positions(c: Case) {
  const F = c.financials;
  const all: { v: number | null; label: string; cls?: string }[] = [
    { v: F.offer, label: "Their offer" },
    { v: F.counter, label: "Planned counter", cls: "plan" },
    { v: F.demand, label: "Our demand" },
    { v: c.billsTotal || null, label: "Medical bills", cls: "plan" },
    { v: F.policyLimit, label: "Policy limit", cls: "end" },
    { v: F.estimatedValue, label: "Estimated value" },
  ];
  return all.filter((p): p is { v: number; label: string; cls?: string } => p.v != null).sort((a, b) => a.v - b.v);
}

function PositionAxis({ c }: { c: Case }) {
  const F = c.financials;
  const pts = positions(c);
  if (pts.length < 2) return null;
  const max = pts[pts.length - 1].v;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="axis" role="img" aria-label={pts.map((p) => `${p.label} ${money(p.v)}`).join(", ")}>
      <div className="trk" />
      {F.targetLow != null && F.targetHigh != null && (
        <div className="band" style={{ left: pct(F.targetLow), width: pct(F.targetHigh - F.targetLow) }} title={`Target range: ${money(F.targetLow)} – ${money(F.targetHigh)}`} />
      )}
      {pts.map((p) => <div key={p.label} className={`mk ${p.cls ?? ""}`} style={{ left: pct(p.v) }} title={`${p.label}: ${money(p.v)}`} />)}
      <div className="lbl dn l" style={{ left: 0 }}><b>$0</b></div>
      {pts.map((p, i) => (
        <div key={p.label} className={`lbl ${i % 2 ? "dn" : "up"}${i === pts.length - 1 ? " r" : ""}`} style={{ left: pct(p.v) }}>
          <b>{moneyK(p.v)}</b>{p.label}
        </div>
      ))}
    </div>
  );
}

export function CardFinancials({ full }: { full?: boolean }) {
  const c = useFirmCase();
  const F = c.financials;
  const stats = [
    F.offer != null && { lb: "Their latest offer", val: money(F.offer), sub: [F.offerDate, F.demand ? `${Math.round((F.offer / F.demand) * 100)}% of our demand` : null].filter(Boolean).join(" · ") },
    F.demand != null && { lb: "Our demand", val: money(F.demand), sub: F.demandDate ? `Sent ${F.demandDate}` : "" },
    F.targetLow != null && F.targetHigh != null && { lb: "Our target range", val: `${moneyK(F.targetLow)} – ${moneyK(F.targetHigh)}`, sub: "Settlement goal", rng: true },
    F.estimatedValue != null && { lb: "Estimated case value", val: money(F.estimatedValue), sub: "From the matter in Clio" },
    F.policyLimit != null && { lb: "Policy limit", val: money(F.policyLimit), sub: "Defendant liability" },
    { lb: "Medical bills", val: money(c.billsTotal), sub: `${c.providers.length} providers` },
  ].filter((s): s is { lb: string; val: string; sub: string; rng?: boolean } => Boolean(s)).slice(0, full ? 4 : 2);
  const gap = F.offer != null && F.targetLow != null ? F.targetLow - F.offer : null;
  return (
    <div className="card">
      <div className="hd"><h3>Case financials</h3><FirmOnly />{!full && <Go to="financials">Full breakdown</Go>}</div>
      <div className="stats" style={full ? undefined : { gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        {stats.map((s, i) => (
          <div key={s.lb} className={i === 0 ? "stat hero" : "stat"}><div className="lb">{s.lb}</div><div className={s.rng ? "val rng" : "val"}>{s.val}</div><div className="sub">{s.sub}</div></div>
        ))}
      </div>
      <PositionAxis c={c} />
      {gap != null
        ? <div className="callout"><Icon name="target" /><span><b>Gap to close: {money(gap)}.</b>{F.counter != null && <> Counter of {money(F.counter)} goes out {F.counterDue}.</>}</span></div>
        : F.note && <div className="callout"><Icon name="target" /><span>{F.note}</span></div>}
    </div>
  );
}

// Where the money would go at the most likely recovery: the middle of the target
// range if one is set, otherwise the case value capped at the policy limit.
export function CardBreakdown() {
  const c = useFirmCase();
  const F = c.financials;
  let at: number | null = null;
  let why = "";
  if (F.targetLow != null && F.targetHigh != null) { at = (F.targetLow + F.targetHigh) / 2; why = "Middle of the target range."; }
  else if (F.estimatedValue != null && F.policyLimit != null && F.estimatedValue > F.policyLimit) { at = F.policyLimit; why = "The case is worth more than the coverage, so this assumes the policy limit."; }
  else if (F.estimatedValue != null) { at = F.estimatedValue; why = "The estimated case value."; }
  if (at == null) return null;

  const liens = F.liens ?? c.billsTotal;
  const fee = at * F.feeShare;
  const parts = [
    { label: F.liens != null ? "Liens asserted" : "Medical liens", v: liens, color: "var(--s1)" },
    { label: "Attorney fee (⅓)", v: fee, color: "var(--s2)" },
    { label: "Case costs", v: F.costs, color: "var(--s3)" },
    { label: "Client receives", v: Math.max(0, at - fee - F.costs - liens), color: "var(--s4)" },
  ];
  return (
    <div className="card">
      <div className="hd"><h3>If it settles at {money(at)}</h3><FirmOnly /></div>
      <p className="ink2" style={{ fontSize: 13 }}>{why} Where the money would go:</p>
      <div className="stackbar">{parts.map((p) => <i key={p.label} style={{ width: `${(p.v / at) * 100}%`, background: p.color }} title={`${p.label}: ${money(p.v)}`} />)}</div>
      <div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label}<b>{money(p.v)}</b></span>)}</div>
    </div>
  );
}

export function CardProviderBills({ withMessage }: { withMessage?: boolean }) {
  const { openMessage } = useApp();
  const c = useFirmCase();
  const max = Math.max(1, ...c.providers.map((p) => p.billed));
  const cols = withMessage ? undefined : { gridTemplateColumns: "minmax(0,1.4fr) 190px 110px 130px" };
  return (
    <div className="card">
      <div className="hd"><h3>Medical bills by provider</h3><span className="muted" style={{ fontSize: 13 }}>Total {money(c.billsTotal)}</span></div>
      <div className="row r-prov th" style={cols}><span>Provider</span><span>Billed</span><span>Records</span><span>Final bill</span>{withMessage && <span />}</div>
      {c.providers.map((p) => (
        <div className="row r-prov" style={cols} key={p.id}>
          <div>{p.name}{withMessage && <small>{p.contact}</small>}</div>
          <div className="barcell"><span className="num">{money(p.billed)}</span><div style={{ flex: 1 }}><div className="bar" style={{ width: `${(p.billed / max) * 100}%` }} title={`${p.name}: ${money(p.billed)}`} /></div></div>
          <Status kind={p.records} label={p.records === "good" ? "Received" : "Missing"} />
          <Status kind={p.bill} label={p.bill === "good" ? "Final" : "Waiting"} />
          {withMessage && <button className="btn ghost sm" onClick={() => openMessage(p.name)}><Icon name="msg" />Message</button>}
        </div>
      ))}
    </div>
  );
}

export function CardClient({ full }: { full?: boolean }) {
  const { toast, openMessage } = useApp();
  const c = useFirmCase();
  const cl = c.client;
  return (
    <div className="card">
      <div className="hd"><h3>Client</h3>{!full && <Go to="client">Full profile</Go>}</div>
      <div className="person"><span className="av lg">{cl.initials}</span><div><b>{cl.name}</b><small>{[cl.age != null && `Age ${cl.age}`, cl.dob && `born ${cl.dob}`].filter(Boolean).join(" · ")}</small></div></div>
      <div className="kv">
        {cl.phone && <><Icon name="phone" /><span>{cl.phone}</span></>}
        {cl.email && <><Icon name="mail" /><span>{cl.email}</span></>}
        {cl.bestTime && <><Icon name="clock" /><span>Best time: {cl.bestTime}</span></>}
        {full && <>
          {cl.address && <><Icon name="pin" /><span>{cl.address}</span></>}
          {cl.language && <><Icon name="msg" /><span>Speaks {cl.language}</span></>}
          {cl.occupation && <><Icon name="user" /><span>{cl.occupation}</span></>}
        </>}
      </div>
      <div className="sect">Incident · {c.incident.date}</div>
      <p style={{ fontSize: 13.5 }}>{c.incident.summary}{full && c.incident.location && <> <span className="ink2">{c.incident.location}.</span></>}</p>
      <div className="sect">Injuries</div>
      <InjuriesList injuries={c.injuries} withProvider={full} />
      <div className="actions">
        <button className="btn" onClick={() => toast("Calling isn't wired up in the prototype")}><Icon name="phone" />Call</button>
        <button className="btn ghost" onClick={() => openMessage(cl.name)}><Icon name="msg" />Message</button>
      </div>
    </div>
  );
}

export function CardCaseFacts() {
  const c = useFirmCase();
  const d = c.deadline;
  const rows = ([
    ["Defendant", c.defendant], ["Insurer", c.insurer.name], ["Claim number", c.insurer.claim],
    ["Adjuster", c.insurer.adjuster],
    ["Policy limit", c.financials.policyLimit != null ? money(c.financials.policyLimit) : null],
    d && [d.label, `${d.date} · ${d.met ? "satisfied" : d.daysLeft >= 0 ? `${d.daysLeft} days left` : `${-d.daysLeft} days ago`}`],
  ].filter(Boolean) as [string, string | null][]).filter(([, v]) => v);
  return (
    <div className="card">
      <div className="hd"><h3>Case details</h3><FirmOnly /></div>
      {rows.map(([k, v]) => <div className="row r-kv" key={k}><span>{k}</span><b style={{ fontWeight: 500 }}>{v}</b></div>)}
    </div>
  );
}

export function CardTasks({ limit }: { limit?: number }) {
  const c = useFirmCase();
  const list = limit ? c.tasks.slice(0, limit) : c.tasks;
  return (
    <div className="card">
      <div className="hd"><h3>Needed on this case</h3>{limit ? <Go to="todo">All to-dos</Go> : null}</div>
      {!list.length && <div className="empty">Nothing open.</div>}
      {list.map((t) => (
        <div className="row r-task" key={t.title}>
          <Icon name="task" /><div><b>{t.title}</b><small>{t.who}</small></div>
          {t.urgent ? <Status kind="warn" label={t.due} /> : <span className="st"><Icon name="cal" sm />{t.due}</span>}
        </div>
      ))}
    </div>
  );
}

export function CardDocs() {
  const c = useFirmCase();
  return (
    <div className="card">
      <div className="hd"><h3>Latest documents</h3><Go to="documents">All documents</Go></div>
      {c.documents.filter((d) => d.important).map((d) => (
        <div className="row r-doc" key={d.id}><Icon name="doc" /><div>{d.name}<small>{d.kind}</small></div><span className="muted" style={{ fontSize: 12.5 }}>{d.date}</span></div>
      ))}
    </div>
  );
}

export function CardDocsFull() {
  const c = useFirmCase();
  return (
    <div className="card">
      <div className="row r-docfull th"><span /><span>Document</span><span>Type</span><span>Date</span><span /></div>
      {c.documents.map((d) => (
        <div className="row r-docfull" key={d.id}>
          <Icon name="doc" /><div>{d.name}</div><span className="ink2">{d.kind}</span><span className="ink2">{d.date}</span>
          {d.pending
            ? <Status kind="warn" label="Requested" />
            : <a className="btn ghost sm" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">Open</a>}
        </div>
      ))}
    </div>
  );
}

function AudienceTag({ u }: { u: CaseUpdate }) {
  const c = useFirmCase();
  if (u.audience === "firm") return <FirmOnly />;
  const who = u.audience === "all" ? "all providers" : (c.providers.find((p) => p.id === u.audience)?.name.split(" ")[0] ?? "a provider");
  return <span className="tag shared"><Icon name="eye" sm />Shared with {who}</span>;
}

export function CardUpdates({ limit }: { limit?: number }) {
  const c = useFirmCase();
  const list = limit ? c.updates.slice(0, limit) : c.updates;
  return (
    <div className="card">
      <div className="hd"><h3>Latest updates</h3>{limit ? <Go to="updates">All updates</Go> : null}</div>
      {!list.length && <div className="empty">No updates yet.</div>}
      {list.map((u, i) => (
        <div className="row r-upd" key={i}>
          <span className="d">{u.date}</span><div><b>{u.firm.t}</b><small>{u.firm.s}</small></div>
          {!limit ? <AudienceTag u={u} /> : u.audience === "firm" ? <span className="tag firm" title="Firm only"><Icon name="lock" sm /></span> : <span />}
        </div>
      ))}
    </div>
  );
}
