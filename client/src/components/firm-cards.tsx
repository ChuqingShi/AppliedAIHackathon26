"use client";

import type { ReactNode } from "react";
import type { Case, CaseUpdate, Injury } from "@/data/types";
import { CaseStatusBadge, useApp, useFirmCase } from "./AppShell";
import { Icon } from "./Icon";
import { FirmOnly, Go, PhotoIdThumb, Status, billsTotal, day, money, moneyK } from "./ui";

export function InjuriesList({ injuries, withProvider }: { injuries: Injury[]; withProvider?: boolean }) {
  if (!injuries.length) return <p className="ink2" style={{ fontSize: 13 }}>No injuries recorded.</p>;
  return injuries.map((j) => (
    <div className="inj" key={j.name}><div>{j.name}<small>{j.status}{withProvider && j.by ? ` · treated by ${j.by}` : ""}</small></div></div>
  ));
}

// The money figures this case actually has, smallest first. Clio holds no
// structured offer or demand for most matters, so those only appear when set.
function positions(c: Case) {
  const f = c.financials;
  const all: { v: number | null; label: string; cls?: string }[] = [
    { v: f.offer, label: "Their offer" },
    { v: f.counter, label: "Planned counter", cls: "plan" },
    { v: f.demand, label: "Our demand" },
    { v: billsTotal(c) || null, label: "Medical bills", cls: "plan" },
    { v: f.policyLimit, label: "Policy limit", cls: "end" },
    { v: f.estimatedValue, label: "Estimated value" },
  ];
  return all.filter((p): p is { v: number; label: string; cls?: string } => p.v != null).sort((a, b) => a.v - b.v);
}

function PositionAxis({ c }: { c: Case }) {
  const f = c.financials;
  const pts = positions(c);
  if (pts.length < 2) return null;
  const max = pts[pts.length - 1].v;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="axis" role="img" aria-label={pts.map((p) => `${p.label} ${money(p.v)}`).join(", ")}>
      <div className="trk" />
      {f.targetLow != null && f.targetHigh != null && (
        <div className="band" style={{ left: pct(f.targetLow), width: pct(f.targetHigh - f.targetLow) }} title={`Target range: ${money(f.targetLow)} – ${money(f.targetHigh)}`} />
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
  const f = c.financials;
  const stats = [
    f.offer != null && { lb: "Their latest offer", val: money(f.offer), sub: [f.offerDate, f.demand ? `${Math.round((f.offer / f.demand) * 100)}% of our demand` : null].filter(Boolean).join(" · ") },
    f.demand != null && { lb: "Our demand", val: money(f.demand), sub: f.demandDate ? `Sent ${f.demandDate}` : "" },
    f.targetLow != null && f.targetHigh != null && { lb: "Our target range", val: `${moneyK(f.targetLow)} – ${moneyK(f.targetHigh)}`, sub: "Settlement goal", rng: true },
    f.estimatedValue != null && { lb: "Estimated case value", val: money(f.estimatedValue), sub: "From the matter in Clio" },
    f.policyLimit != null && { lb: "Policy limit", val: money(f.policyLimit), sub: "Defendant liability" },
    { lb: "Medical bills", val: money(billsTotal(c)), sub: `${c.providers.length} providers` },
  ].filter((x): x is { lb: string; val: string; sub: string; rng?: boolean } => Boolean(x)).slice(0, full ? 4 : 2);
  const gap = f.offer != null && f.targetLow != null ? f.targetLow - f.offer : null;
  return (
    <div className="card">
      <div className="hd"><h3>Case financials</h3><FirmOnly />{!full && <Go to="financials">Full breakdown</Go>}</div>
      <div className="stats" style={full ? undefined : { gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        {stats.map((x, i) => (
          <div key={x.lb} className={i === 0 ? "stat hero" : "stat"}><div className="lb">{x.lb}</div><div className={x.rng ? "val rng" : "val"}>{x.val}</div><div className="sub">{x.sub}</div></div>
        ))}
      </div>
      <PositionAxis c={c} />
      {gap != null
        ? <div className="callout"><Icon name="target" /><span><b>Gap to close: {money(gap)}.</b>{f.counter != null && <> Counter of {money(f.counter)} goes out {f.counterDue}.</>}</span></div>
        : f.note && <div className="callout"><Icon name="target" /><span>{f.note}</span></div>}
    </div>
  );
}

// Where the money would go at the most likely recovery: the middle of the target
// range if one is set, otherwise the case value capped at the policy limit.
export function CardBreakdown() {
  const c = useFirmCase();
  const f = c.financials;
  let at: number | null = null;
  let why = "";
  if (f.targetLow != null && f.targetHigh != null) { at = (f.targetLow + f.targetHigh) / 2; why = "Middle of the target range."; }
  else if (f.estimatedValue != null && f.policyLimit != null && f.estimatedValue > f.policyLimit) { at = f.policyLimit; why = "The case is worth more than the coverage, so this assumes the policy limit."; }
  else if (f.estimatedValue != null) { at = f.estimatedValue; why = "The estimated case value."; }
  if (at == null) return <div className="card"><div className="hd"><h3>Settlement breakdown</h3><FirmOnly /></div><div className="empty">No case value or target range in Clio yet.</div></div>;

  const liens = f.liens ?? billsTotal(c);
  const fee = at * f.feeShare;
  const parts = [
    { label: f.liens != null ? "Liens asserted" : "Medical liens", v: liens, color: "var(--s1)" },
    { label: "Attorney fee (⅓)", v: fee, color: "var(--s2)" },
    { label: "Case costs", v: f.costs, color: "var(--s3)" },
    { label: "Client receives", v: Math.max(0, at - fee - f.costs - liens), color: "var(--s4)" },
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
      <div className="hd"><h3>Medical bills by provider</h3><span className="muted" style={{ fontSize: 13 }}>Total {money(billsTotal(c))}</span></div>
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
  const { client: c, incident, injuries, photoIdDoc } = useFirmCase();
  return (
    <div className="card">
      <div className="hd"><h3>Client</h3>{c.updated && <span className="tag shared" title="The client changed their own details"><Icon name="user" sm />Updated by client {day(c.updated, false)}</span>}{!full && <Go to="client">Full profile</Go>}</div>
      <div className="person"><span className="av lg">{c.initials}</span><div><b>{c.name}</b><small>{[c.age != null && `Age ${c.age}`, c.dob && `born ${day(c.dob)}`].filter(Boolean).join(" · ")}</small></div>
        {/* The photo ID on file; it opens the full document. Firm only (see photoIdDoc in types.ts). */}
        {photoIdDoc != null && <PhotoIdThumb docId={photoIdDoc} name={c.name} />}
      </div>
      <div className="kv">
        {c.phone && <><Icon name="phone" /><span>{c.phone}</span></>}
        {c.email && <><Icon name="mail" /><span>{c.email}</span></>}
        {c.bestTime && <><Icon name="clock" /><span>Best time: {c.bestTime}</span></>}
        {full && <>
          {c.address && <><Icon name="pin" /><span>{c.address}</span></>}
          {c.language && <><Icon name="msg" /><span>Speaks {c.language}</span></>}
          {c.occupation && <><Icon name="user" /><span>{c.occupation}</span></>}
        </>}
      </div>
      <div className="sect">Incident · {incident.date}</div>
      <p style={{ fontSize: 13.5 }}>{incident.summary}{full && incident.location && <> <span className="ink2">{incident.location}.</span></>}</p>
      <div className="sect">Injuries</div>
      <InjuriesList injuries={injuries} withProvider={full} />
      <div className="actions">
        <button className="btn" onClick={() => toast("Calling isn't wired up in the prototype")}><Icon name="phone" />Call</button>
        <button className="btn ghost" onClick={() => openMessage(c.name)}><Icon name="msg" />Message</button>
      </div>
    </div>
  );
}

export function CardCaseFacts() {
  const c = useFirmCase();
  const d = c.deadline;
  const { policyLimit } = c.financials;
  const { opened, closed, length } = c.dates;
  // The case's three key dates come first: when it started, when it ended (or that
  // it hasn't), and the statute of limitations deadline.
  const dates: [string, ReactNode][] = [
    ["Case opened", opened],
    // yellow "Still open" or the green close date, then how long the case ran
    ["Case closed", closed || opened
      ? <><CaseStatusBadge closed={closed} />{length && <span className="ink2"> · {closed ? `after ${length}` : `${length} so far`}</span>}</>
      : null],
    // The deadline is always listed, so a case without one set in Clio stands out.
    ["Statute of limitations", d
      ? `${d.date} · ${d.met ? "met, filed in time" : d.daysLeft >= 0 ? `${d.daysLeft} days left` : `passed ${-d.daysLeft} days ago`}`
      : "Not set in Clio"],
  ];
  // Then the other facts Clio has; a missing one is left out rather than shown blank.
  const rows = ([
    ...dates,
    ["Defendant", c.defendant], ["Insurer", c.insurer.name], ["Claim number", c.insurer.claim],
    ["Adjuster", c.insurer.adjuster], ["Policy limit", policyLimit != null ? money(policyLimit) : null],
  ] as [string, ReactNode][]).filter(([, v]) => v);
  return (
    <div className="card">
      <div className="hd"><h3>Case details</h3><FirmOnly /></div>
      {rows.map(([k, v]) => <div className="row r-kv" key={k}><span>{k}</span><b style={{ fontWeight: 500 }}>{v}</b></div>)}
    </div>
  );
}

export function CardTasks({ limit }: { limit?: number }) {
  const { tasks } = useFirmCase();
  const list = limit ? tasks.slice(0, limit) : tasks;
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
  const { documents } = useFirmCase();
  return (
    <div className="card">
      <div className="hd"><h3>Important documents</h3><Go to="documents">All documents</Go></div>
      {documents.filter((d) => d.important).map((d) => (
        <div className="row r-doc" key={d.id ?? d.name}><Icon name="doc" /><div>{d.name}<small>{d.kind}</small></div><span className="muted" style={{ fontSize: 12.5 }}>{d.date}</span></div>
      ))}
    </div>
  );
}

export function CardDocsFull() {
  const { documents } = useFirmCase();
  return (
    <div className="card">
      <div className="hd"><h3>All documents</h3></div>
      <div className="row r-docfull th"><span /><span>Document</span><span>Type</span><span>Date</span><span /></div>
      {documents.map((d) => (
        <div className="row r-docfull" key={d.id ?? d.name}>
          <Icon name="doc" /><div>{d.name}</div><span className="ink2">{d.kind}</span><span className="ink2">{d.date}</span>
          {d.pending
            ? <Status kind="warn" label="Requested" />
            : d.id != null && <a className="btn ghost sm" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">Open</a>}
        </div>
      ))}
    </div>
  );
}

function AudienceTag({ u }: { u: CaseUpdate }) {
  const { providers } = useFirmCase();
  if (u.audience === "firm") return <FirmOnly />;
  const who = u.audience === "all" ? "all providers" : (providers.find((p) => p.id === u.audience)?.name.split(" ")[0] ?? "a provider");
  return <span className="tag shared"><Icon name="eye" sm />Shared with {who}</span>;
}

export function CardUpdates({ limit }: { limit?: number }) {
  const { updates } = useFirmCase();
  const list = limit ? updates.slice(0, limit) : updates;
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

// ---- The overview's first rows: what needs action, where the case is, the money ----

export interface Alert { text: string; to: string }

// What needs someone's attention today, worst first: overdue to-dos, to-dos due
// this week, providers we're still waiting on, and a statute of limitations that
// is close, passed or missing. Each links to the page where it gets dealt with.
export function attention(c: Case): Alert[] {
  const overdue = c.tasks.filter((t) => t.daysLeft != null && t.daysLeft < 0);
  const soon = c.tasks.filter((t) => t.daysLeft != null && t.daysLeft >= 0 && t.daysLeft <= 7);
  const waiting = c.providers.filter((p) => p.bill === "warn" || p.records === "warn");
  const d = c.deadline;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    overdue.length ? { text: `${plural(overdue.length, "to-do", "to-dos")} overdue`, to: "todo" } : null,
    soon.length ? { text: `${plural(soon.length, "to-do", "to-dos")} due this week`, to: "todo" } : null,
    waiting.length ? { text: `Waiting on ${plural(waiting.length, "provider", "providers")}`, to: "providers" } : null,
    !d ? { text: "No statute of limitations set in Clio", to: "client" }
      : !d.met && d.daysLeft < 0 ? { text: `Statute of limitations passed ${d.date}`, to: "client" }
      : !d.met && d.daysLeft <= 180 ? { text: `Statute of limitations in ${d.daysLeft} days`, to: "client" }
      : null,
  ].filter((a): a is Alert => a != null);
}

export function CardAttention() {
  const c = useFirmCase();
  const alerts = attention(c);
  // the next to-do that isn't overdue yet: what to work on after the alerts
  const next = c.tasks.find((t) => t.daysLeft == null || t.daysLeft >= 0);
  return (
    <div className="card attn">
      <div className="hd"><h3>Needs attention</h3>{next && <span className="next">Next due: <b>{next.title}</b> · {next.due}</span>}</div>
      <div className="alerts">
        {alerts.length
          ? alerts.map((a) => <Go key={a.text} to={a.to} className="alert"><Icon name="bang" sm />{a.text}</Go>)
          : <span className="alert ok"><Icon name="check" sm />Nothing needs attention right now</span>}
      </div>
    </div>
  );
}

export function CardStatus() {
  const c = useFirmCase();
  const stage = c.stages[c.stageIndex];
  const nextStage = c.stages[c.stageIndex + 1];
  const latest = c.updates[0];
  return (
    <div className="card">
      <div className="hd"><h3>Where the case is</h3><Go to="updates">History</Go></div>
      <p className="lead">In <b>{stage.name.toLowerCase()}</b>{stage.date && stage.date !== "Upcoming" ? <> since {stage.date}</> : null}.</p>
      <div className="row r-kv"><span>Case</span><span><CaseStatusBadge closed={c.dates.closed} />{c.dates.length && <span className="ink2"> · {c.dates.length}</span>}</span></div>
      {nextStage && <div className="row r-kv"><span>Next stage</span><b style={{ fontWeight: 500 }}>{nextStage.name}</b></div>}
      {latest && <div className="row r-kv"><span>Latest</span><span><b style={{ fontWeight: 500 }}>{latest.firm.t}</b> <span className="ink2">· {latest.date}</span></span></div>}
    </div>
  );
}

// The four numbers that matter most, small; the full picture is on Financials.
export function CardMoney() {
  const c = useFirmCase();
  const f = c.financials;
  const stats = ([
    ["Case value", f.estimatedValue], ["Policy limit", f.policyLimit],
    ["Medical bills", billsTotal(c) || null], ["Liens", f.liens],
  ] as [string, number | null][]).filter(([, v]) => v != null) as [string, number][];
  return (
    <div className="card">
      <div className="hd"><h3>Money at a glance</h3><FirmOnly /><Go to="financials">Details</Go></div>
      {stats.length
        ? <div className="stats" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))", marginBottom: 0 }}>
            {stats.map(([lb, v]) => <div className="stat" key={lb}><div className="lb">{lb}</div><div className="val">{moneyK(v)}</div></div>)}
          </div>
        : <div className="empty">No figures in Clio yet.</div>}
    </div>
  );
}
