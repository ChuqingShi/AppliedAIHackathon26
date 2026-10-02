"use client";

import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { CASE, F, billsTotal } from "@/data/case";
import type { CaseUpdate } from "@/data/case";
import { useApp } from "./AppShell";
import { SUGGESTED } from "./assistant";
import { Icon } from "./Icon";
import { FirmOnly, Go, Status, money, moneyK } from "./ui";

export function InjuriesList({ withProvider }: { withProvider?: boolean }) {
  return CASE.injuries.map((j) => (
    <div className="inj" key={j.name}><div>{j.name}<small>{j.status}{withProvider ? ` · treated by ${j.by}` : ""}</small></div></div>
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

function PositionAxis() {
  const pct = (v: number) => `${(v / F.policyLimit) * 100}%`;
  return (
    <div className="axis" role="img" aria-label={`Offer ${money(F.offer)}, target ${money(F.targetLow)} to ${money(F.targetHigh)}, planned counter ${money(F.counter)}, demand ${money(F.demand)}, policy limit ${money(F.policyLimit)}`}>
      <div className="trk" />
      <div className="band" style={{ left: pct(F.targetLow), width: pct(F.targetHigh - F.targetLow) }} title={`Target range: ${money(F.targetLow)} – ${money(F.targetHigh)}`} />
      <div className="mk" style={{ left: pct(F.offer) }} title={`Their offer: ${money(F.offer)}`} />
      <div className="mk plan" style={{ left: pct(F.counter) }} title={`Planned counter: ${money(F.counter)}`} />
      <div className="mk" style={{ left: pct(F.demand) }} title={`Our demand: ${money(F.demand)}`} />
      <div className="mk end" style={{ left: "100%" }} title={`Policy limit: ${money(F.policyLimit)}`} />
      <div className="lbl dn l" style={{ left: 0 }}><b>$0</b></div>
      <div className="lbl dn" style={{ left: pct(F.offer) }}><b>{moneyK(F.offer)}</b>Their offer</div>
      <div className="lbl up" style={{ left: pct((F.targetLow + F.targetHigh) / 2) }}><b>{moneyK(F.targetLow)} – {moneyK(F.targetHigh)}</b>Our target</div>
      <div className="lbl dn" style={{ left: pct(F.counter) }}><b>{moneyK(F.counter)}</b>Planned counter</div>
      <div className="lbl up" style={{ left: `calc(${pct(F.demand)} + 1.5%)` }}><b>{moneyK(F.demand)}</b>Our demand</div>
      <div className="lbl up r" style={{ left: "100%" }}><b>{moneyK(F.policyLimit)}</b>Policy limit</div>
    </div>
  );
}

export function CardFinancials({ full }: { full?: boolean }) {
  return (
    <div className="card">
      <div className="hd"><h3>Case financials</h3><FirmOnly />{!full && <Go to="financials">Full breakdown</Go>}</div>
      <div className="stats" style={full ? undefined : { gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        <div className="stat hero"><div className="lb">Their latest offer</div><div className="val">{money(F.offer)}</div><div className="sub">{F.offerDate} · {Math.round((F.offer / F.demand) * 100)}% of our demand</div></div>
        <div className="stat"><div className="lb">Our demand</div><div className="val">{money(F.demand)}</div><div className="sub">Sent {F.demandDate}</div></div>
        <div className="stat"><div className="lb">Our target range</div><div className="val rng">{moneyK(F.targetLow)} – {moneyK(F.targetHigh)}</div><div className="sub">Settlement goal</div></div>
        <div className="stat"><div className="lb">Medical bills</div><div className="val">{money(billsTotal)}</div><div className="sub">{CASE.providers.length} providers on lien</div></div>
      </div>
      <PositionAxis />
      <div className="callout"><Icon name="target" /><span><b>Gap to close: {money(F.targetLow - F.offer)}.</b> Counter of {money(F.counter)} goes out {F.counterDue}.</span></div>
    </div>
  );
}

export function CardBreakdown() {
  const mid = (F.targetLow + F.targetHigh) / 2;
  const fee = mid * F.feeShare;
  const parts = [
    { label: "Medical liens", v: billsTotal, color: "var(--s1)" },
    { label: "Attorney fee (⅓)", v: fee, color: "var(--s2)" },
    { label: "Case costs", v: F.costs, color: "var(--s3)" },
    { label: "Client receives", v: mid - fee - F.costs - billsTotal, color: "var(--s4)" },
  ];
  return (
    <div className="card">
      <div className="hd"><h3>If it settles at {money(mid)}</h3><FirmOnly /></div>
      <p className="ink2" style={{ fontSize: 13 }}>Middle of the target range. Where the money would go:</p>
      <div className="stackbar">{parts.map((p) => <i key={p.label} style={{ width: `${(p.v / mid) * 100}%`, background: p.color }} title={`${p.label}: ${money(p.v)}`} />)}</div>
      <div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label}<b>{money(p.v)}</b></span>)}</div>
    </div>
  );
}

export function CardProviderBills({ withMessage }: { withMessage?: boolean }) {
  const { openMessage } = useApp();
  const max = Math.max(...CASE.providers.map((p) => p.billed));
  const cols = withMessage ? undefined : { gridTemplateColumns: "minmax(0,1.4fr) 190px 110px 130px" };
  return (
    <div className="card">
      <div className="hd"><h3>Medical bills by provider</h3><span className="muted" style={{ fontSize: 13 }}>Total {money(billsTotal)}</span></div>
      <div className="row r-prov th" style={cols}><span>Provider</span><span>Billed</span><span>Records</span><span>Final bill</span>{withMessage && <span />}</div>
      {CASE.providers.map((p) => (
        <div className="row r-prov" style={cols} key={p.id}>
          <div>{p.name}{withMessage && <small>{p.contact}</small>}</div>
          <div className="barcell"><span className="num">{money(p.billed)}</span><div style={{ flex: 1 }}><div className="bar" style={{ width: `${(p.billed / max) * 100}%` }} title={`${p.name}: ${money(p.billed)}`} /></div></div>
          <Status kind={p.records} label="Received" />
          <Status kind={p.bill} label={p.bill === "good" ? "Final" : "Waiting"} />
          {withMessage && <button className="btn ghost sm" onClick={() => openMessage(p.name)}><Icon name="msg" />Message</button>}
        </div>
      ))}
    </div>
  );
}

export function CardClient({ full }: { full?: boolean }) {
  const { toast, openMessage } = useApp();
  const c = CASE.client;
  return (
    <div className="card">
      <div className="hd"><h3>Client</h3>{!full && <Go to="client">Full profile</Go>}</div>
      <div className="person"><span className="av lg">{c.initials}</span><div><b>{c.name}</b><small>Age {c.age} · born {c.dob}</small></div></div>
      <div className="kv">
        <Icon name="phone" /><span>{c.phone}</span>
        <Icon name="mail" /><span>{c.email}</span>
        <Icon name="clock" /><span>Best time: {c.bestTime}</span>
        {full && <><Icon name="pin" /><span>{c.address}</span><Icon name="msg" /><span>Speaks {c.language}</span><Icon name="user" /><span>{c.occupation}</span></>}
      </div>
      <div className="sect">Incident · {CASE.incident.date}</div>
      <p style={{ fontSize: 13.5 }}>{CASE.incident.summary}{full && <> <span className="ink2">{CASE.incident.location}.</span></>}</p>
      <div className="sect">Injuries</div>
      <InjuriesList withProvider={full} />
      <div className="actions">
        <button className="btn" onClick={() => toast("Calling isn't wired up in the prototype")}><Icon name="phone" />Call</button>
        <button className="btn ghost" onClick={() => openMessage(c.name)}><Icon name="msg" />Message</button>
      </div>
    </div>
  );
}

export function CardCaseFacts() {
  const rows = [
    ["Defendant", "Coastal Freight Lines"], ["Insurer", CASE.insurer.name], ["Claim number", CASE.insurer.claim],
    ["Adjuster", CASE.insurer.adjuster], ["Policy limit", money(F.policyLimit)],
    [CASE.deadline.label, `${CASE.deadline.date} · ${CASE.deadline.daysLeft} days left`],
  ];
  return (
    <div className="card">
      <div className="hd"><h3>Case details</h3><FirmOnly /></div>
      {rows.map(([k, v]) => <div className="row r-kv" key={k}><span>{k}</span><b style={{ fontWeight: 500 }}>{v}</b></div>)}
    </div>
  );
}

export function CardTasks({ limit }: { limit?: number }) {
  const list = limit ? CASE.tasks.slice(0, limit) : CASE.tasks;
  return (
    <div className="card">
      <div className="hd"><h3>Needed on this case</h3>{limit ? <Go to="todo">All to-dos</Go> : null}</div>
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
  return (
    <div className="card">
      <div className="hd"><h3>Important documents</h3><Go to="documents">All documents</Go></div>
      {CASE.documents.filter((d) => d.important).map((d) => (
        <div className="row r-doc" key={d.name}><Icon name="doc" /><div>{d.name}<small>{d.kind}</small></div><span className="muted" style={{ fontSize: 12.5 }}>{d.date}</span></div>
      ))}
    </div>
  );
}

export function CardDocsFull() {
  const { toast } = useApp();
  return (
    <div className="card">
      <div className="row r-docfull th"><span /><span>Document</span><span>Type</span><span>Date</span><span /></div>
      {CASE.documents.map((d) => (
        <div className="row r-docfull" key={d.name}>
          <Icon name="doc" /><div>{d.name}</div><span className="ink2">{d.kind}</span><span className="ink2">{d.date}</span>
          {d.pending
            ? <Status kind="warn" label="Requested" />
            : <button className="btn ghost sm" onClick={() => toast("Opening files isn't wired up in the prototype")}>Open</button>}
        </div>
      ))}
    </div>
  );
}

function AudienceTag({ u }: { u: CaseUpdate }) {
  if (u.audience === "firm") return <FirmOnly />;
  const who = u.audience === "all" ? "all providers" : CASE.providers.find((p) => p.id === u.audience)!.name.split(" ")[0];
  return <span className="tag shared"><Icon name="eye" sm />Shared with {who}</span>;
}

export function CardUpdates({ limit }: { limit?: number }) {
  const list = limit ? CASE.updates.slice(0, limit) : CASE.updates;
  return (
    <div className="card">
      <div className="hd"><h3>Latest updates</h3>{limit ? <Go to="updates">All updates</Go> : null}</div>
      {list.map((u) => (
        <div className="row r-upd" key={u.firm.t}>
          <span className="d">{u.date}</span><div><b>{u.firm.t}</b><small>{u.firm.s}</small></div>
          {!limit ? <AudienceTag u={u} /> : u.audience === "firm" ? <span className="tag firm" title="Firm only"><Icon name="lock" sm /></span> : <span />}
        </div>
      ))}
    </div>
  );
}
