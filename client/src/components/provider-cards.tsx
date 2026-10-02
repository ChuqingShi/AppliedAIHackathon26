"use client";

import { useApp, useProviderCase } from "./AppShell";
import { InjuriesList } from "./firm-cards";
import { Icon } from "./Icon";
import { Go, Status, day, money } from "./ui";

const UPLOAD_TOAST = "Upload isn't wired up in the prototype";

export function CardProgress() {
  const { toast } = useApp();
  const p = useProviderCase();
  const r = p.requests[0];
  return (
    <div className="card">
      <div className="hd"><h3>How the case is going</h3><Go to="progress">Full history</Go></div>
      <p className="lead">The case is in <b>{p.stages[p.stageIndex].name.toLowerCase()}</b>. Your bill of <b>{money(p.lien)}</b> is on file with the law firm. You will be notified here as soon as there is a settlement; providers are paid at the final step.</p>
      <div className="lien"><b>{money(p.lien)}</b><span>Your lien balance on this case</span></div>
      {r && (
        <div className="need">
          <div className="k"><Icon name="bang" />Needed from you</div>
          <div className="t">{r.title}</div>
          <p>{r.detail}</p>
          <div className="rw"><span className="st"><Icon name="cal" sm />Due {r.due} · {r.daysLeft >= 0 ? `${r.daysLeft} days left` : `${-r.daysLeft} days overdue`}</span><button className="btn sm" onClick={() => toast(UPLOAD_TOAST)}><Icon name="upload" />Upload</button></div>
        </div>
      )}
    </div>
  );
}

export function CardPatient({ full }: { full?: boolean }) {
  const { patient: p, incident, injuries } = useProviderCase();
  return (
    <div className="card">
      <div className="hd"><h3>Patient</h3>{!full && <Go to="patient">Details</Go>}</div>
      <div className="person"><span className="av lg">{p.initials}</span><div><b>{p.name}</b><small>{[p.age != null && `Age ${p.age}`, p.dob && `born ${day(p.dob)}`].filter(Boolean).join(" · ")}</small></div></div>
      <div className="kv">
        {p.phone && <><Icon name="phone" /><span>{p.phone}</span></>}
        {p.since && <><Icon name="cal" /><span>Your patient since {p.since}</span></>}
      </div>
      <div className="sect">Incident · {incident.date}</div>
      <p style={{ fontSize: 13.5 }}>{incident.type}. {incident.summary}</p>
      <div className="sect">Injuries on this case</div>
      <InjuriesList injuries={injuries} withProvider={full} />
    </div>
  );
}

export function CardTeam({ full }: { full?: boolean }) {
  const { openMessage } = useApp();
  const { team, firm } = useProviderCase();
  return (
    <div className="card">
      <div className="hd"><h3>Legal team</h3><span className="muted" style={{ fontSize: 13 }}>{firm}</span></div>
      {team.map((m) => (
        <div className="row r-team" key={m.name}>
          <span className={m.main ? "av" : "av alt"}>{m.initials}</span>
          <div><b>{m.name}</b><small>{m.role}</small>{m.main && <small className="main-contact">Your main contact</small>}</div>
          <button className={m.main ? "btn sm" : "btn ghost sm"} onClick={() => openMessage(m.name)}><Icon name="msg" />Message</button>
        </div>
      ))}
      {full && <p className="ink2" style={{ fontSize: 13, marginTop: 12 }}>Messages go to the whole team on this case, so anyone can pick them up.</p>}
    </div>
  );
}

export function CardRecords() {
  const { toast } = useApp();
  const { documents } = useProviderCase();
  return (
    <div className="card">
      <div className="hd"><h3>Your medical records &amp; documents</h3><button className="btn sm" onClick={() => toast(UPLOAD_TOAST)}><Icon name="upload" />Upload</button></div>
      {!documents.length && <div className="empty">Nothing on file from you yet.</div>}
      {documents.map((d) => (
        <div className="row r-doc" key={d.name}><Icon name="doc" /><div>{d.name}<small>{d.date}</small></div><Status kind={d.status} label={d.label} /></div>
      ))}
    </div>
  );
}

export function CardBill() {
  const { billLines, lien } = useProviderCase();
  const max = Math.max(1, ...billLines.map((l) => l.amount));
  return (
    <div className="card">
      <div className="hd"><h3>Your bill</h3>{billLines.length > 0 && <Status kind="good" label="On file" />}</div>
      {billLines.map((l) => (
        <div className="line" key={l.name}><span>{l.name}</span><div><div className="bar" style={{ width: `${(l.amount / max) * 100}%` }} title={`${l.name}: ${money(l.amount)}`} /></div><span className="num">{money(l.amount)}</span></div>
      ))}
      <div className="line" style={{ borderTop: "2px solid var(--axis)", marginTop: 6, paddingTop: 10, fontWeight: 700 }}><span>Total on lien</span><span /><span className="num">{money(lien)}</span></div>
    </div>
  );
}

export function CardProviderUpdates({ limit }: { limit?: number }) {
  const { updates } = useProviderCase();
  const list = limit ? updates.slice(0, limit) : updates;
  return (
    <div className="card">
      <div className="hd"><h3>Status updates</h3>{limit ? <Go to="progress">All updates</Go> : null}</div>
      {!list.length && <div className="empty">No updates shared with you yet.</div>}
      {list.map((u, i) => (
        <div className="row r-upd" style={{ gridTemplateColumns: "96px 1fr" }} key={i}><span className="d">{u.date}</span><div><b>{u.t}</b><small>{u.s}</small></div></div>
      ))}
    </div>
  );
}
