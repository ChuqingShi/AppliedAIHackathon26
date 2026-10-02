"use client";

import type { Case, CaseUpdate, Injury } from "@/data/types";
import { useApp, useFirmCase } from "./AppShell";
import { Icon } from "./Icon";
import { FirmOnly, Go, Status, billsTotal, day, money, moneyK } from "./ui";

export function InjuriesList({ injuries, withProvider }: { injuries: Injury[]; withProvider?: boolean }) {
  return injuries.map((j) => (
    <div className="inj" key={j.name}><div>{j.name}<small>{j.status}{withProvider ? ` · treated by ${j.by}` : ""}</small></div></div>
  ));
}

function PositionAxis({ f }: { f: Case["financials"] }) {
  const pct = (v: number) => `${(v / f.policyLimit) * 100}%`;
  return (
    <div className="axis" role="img" aria-label={`Offer ${money(f.offer)}, target ${money(f.targetLow)} to ${money(f.targetHigh)}, planned counter ${money(f.counter)}, demand ${money(f.demand)}, policy limit ${money(f.policyLimit)}`}>
      <div className="trk" />
      <div className="band" style={{ left: pct(f.targetLow), width: pct(f.targetHigh - f.targetLow) }} title={`Target range: ${money(f.targetLow)} – ${money(f.targetHigh)}`} />
      <div className="mk" style={{ left: pct(f.offer) }} title={`Their offer: ${money(f.offer)}`} />
      <div className="mk plan" style={{ left: pct(f.counter) }} title={`Planned counter: ${money(f.counter)}`} />
      <div className="mk" style={{ left: pct(f.demand) }} title={`Our demand: ${money(f.demand)}`} />
      <div className="mk end" style={{ left: "100%" }} title={`Policy limit: ${money(f.policyLimit)}`} />
      <div className="lbl dn l" style={{ left: 0 }}><b>$0</b></div>
      <div className="lbl dn" style={{ left: pct(f.offer) }}><b>{moneyK(f.offer)}</b>Their offer</div>
      <div className="lbl up" style={{ left: pct((f.targetLow + f.targetHigh) / 2) }}><b>{moneyK(f.targetLow)} – {moneyK(f.targetHigh)}</b>Our target</div>
      <div className="lbl dn" style={{ left: pct(f.counter) }}><b>{moneyK(f.counter)}</b>Planned counter</div>
      <div className="lbl up" style={{ left: `calc(${pct(f.demand)} + 1.5%)` }}><b>{moneyK(f.demand)}</b>Our demand</div>
      <div className="lbl up r" style={{ left: "100%" }}><b>{moneyK(f.policyLimit)}</b>Policy limit</div>
    </div>
  );
}

export function CardFinancials({ full }: { full?: boolean }) {
  const c = useFirmCase();
  const f = c.financials;
  return (
    <div className="card">
      <div className="hd"><h3>Case financials</h3><FirmOnly />{!full && <Go to="financials">Full breakdown</Go>}</div>
      <div className="stats" style={full ? undefined : { gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        <div className="stat hero"><div className="lb">Their latest offer</div><div className="val">{money(f.offer)}</div><div className="sub">{f.offerDate} · {Math.round((f.offer / f.demand) * 100)}% of our demand</div></div>
        <div className="stat"><div className="lb">Our demand</div><div className="val">{money(f.demand)}</div><div className="sub">Sent {f.demandDate}</div></div>
        <div className="stat"><div className="lb">Our target range</div><div className="val rng">{moneyK(f.targetLow)} – {moneyK(f.targetHigh)}</div><div className="sub">Settlement goal</div></div>
        <div className="stat"><div className="lb">Medical bills</div><div className="val">{money(billsTotal(c))}</div><div className="sub">{c.providers.length} providers on lien</div></div>
      </div>
      <PositionAxis f={f} />
      <div className="callout"><Icon name="target" /><span><b>Gap to close: {money(f.targetLow - f.offer)}.</b> Counter of {money(f.counter)} goes out {f.counterDue}.</span></div>
    </div>
  );
}

export function CardBreakdown() {
  const c = useFirmCase();
  const f = c.financials;
  const bills = billsTotal(c);
  const mid = (f.targetLow + f.targetHigh) / 2;
  const fee = mid * f.feeShare;
  const parts = [
    { label: "Medical liens", v: bills, color: "var(--s1)" },
    { label: "Attorney fee (⅓)", v: fee, color: "var(--s2)" },
    { label: "Case costs", v: f.costs, color: "var(--s3)" },
    { label: "Client receives", v: mid - fee - f.costs - bills, color: "var(--s4)" },
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
  const c = useFirmCase();
  const max = Math.max(...c.providers.map((p) => p.billed));
  const cols = withMessage ? undefined : { gridTemplateColumns: "minmax(0,1.4fr) 190px 110px 130px" };
  return (
    <div className="card">
      <div className="hd"><h3>Medical bills by provider</h3><span className="muted" style={{ fontSize: 13 }}>Total {money(billsTotal(c))}</span></div>
      <div className="row r-prov th" style={cols}><span>Provider</span><span>Billed</span><span>Records</span><span>Final bill</span>{withMessage && <span />}</div>
      {c.providers.map((p) => (
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
  const { client: c, incident, injuries } = useFirmCase();
  return (
    <div className="card">
      <div className="hd"><h3>Client</h3>{c.updated && <span className="tag shared" title="The client changed their own details"><Icon name="user" sm />Updated by client {day(c.updated, false)}</span>}{!full && <Go to="client">Full profile</Go>}</div>
      <div className="person"><span className="av lg">{c.initials}</span><div><b>{c.name}</b><small>Age {c.age} · born {day(c.dob)}</small></div></div>
      <div className="kv">
        <Icon name="phone" /><span>{c.phone}</span>
        <Icon name="mail" /><span>{c.email}</span>
        <Icon name="clock" /><span>Best time: {c.bestTime}</span>
        {full && <><Icon name="pin" /><span>{c.address}</span><Icon name="msg" /><span>Speaks {c.language}</span><Icon name="user" /><span>{c.occupation}</span></>}
      </div>
      <div className="sect">Incident · {incident.date}</div>
      <p style={{ fontSize: 13.5 }}>{incident.summary}{full && <> <span className="ink2">{incident.location}.</span></>}</p>
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
  const rows = [
    ["Defendant", c.defendant], ["Insurer", c.insurer.name], ["Claim number", c.insurer.claim],
    ["Adjuster", c.insurer.adjuster], ["Policy limit", money(c.financials.policyLimit)],
    [c.deadline.label, `${c.deadline.date} · ${c.deadline.daysLeft} days left`],
  ];
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
        <div className="row r-doc" key={d.name}><Icon name="doc" /><div>{d.name}<small>{d.kind}</small></div><span className="muted" style={{ fontSize: 12.5 }}>{d.date}</span></div>
      ))}
    </div>
  );
}

export function CardDocsFull() {
  const { toast } = useApp();
  const { documents } = useFirmCase();
  return (
    <div className="card">
      <div className="hd"><h3>All documents</h3></div>
      <div className="row r-docfull th"><span /><span>Document</span><span>Type</span><span>Date</span><span /></div>
      {documents.map((d) => (
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
  const { providers } = useFirmCase();
  if (u.audience === "firm") return <FirmOnly />;
  const who = u.audience === "all" ? "all providers" : providers.find((p) => p.id === u.audience)!.name.split(" ")[0];
  return <span className="tag shared"><Icon name="eye" sm />Shared with {who}</span>;
}

export function CardUpdates({ limit }: { limit?: number }) {
  const { updates } = useFirmCase();
  const list = limit ? updates.slice(0, limit) : updates;
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
