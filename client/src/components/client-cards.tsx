"use client";

import { startTransition, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { saveClientDetails } from "@/app/actions";
import { DETAILS } from "@/data/details";
import type { DetailField } from "@/data/details";
import type { DetailErrors } from "@/data/types";
import { useApp, useClientCase } from "./AppShell";
import { InjuriesList } from "./firm-cards";
import { Icon } from "./Icon";
import { TeamList } from "./provider-cards";
import { Status, day } from "./ui";

// What the firm holds about the client personally, which the client can correct.
// The firm and the providers treating them see what they save.
export function CardMyDetails() {
  const { toast } = useApp();
  const { client, firm } = useClientCase();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<DetailErrors>({});
  const [saving, startSaving] = useTransition();

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startSaving(async () => {
      try {
        const problems = await saveClientDetails(form);
        // Shown in step with the saved details the server sends back.
        startTransition(() => {
          setErrors(problems ?? {});
          if (!problems) setEditing(false);
        });
        if (!problems) toast("Saved. Your legal team and medical providers now see your updated details.");
      } catch {
        toast("Couldn’t save your details. Try again in a moment.");
      }
    });
  }

  function cancel() {
    setErrors({});
    setEditing(false);
  }

  // A detail as the client reads it, or null when the firm doesn't have it.
  const shown = (f: DetailField) => {
    const value = client[f.key];
    if (!value) return null;
    return f.type === "date" ? [day(value), client.age != null && `age ${client.age}`].filter(Boolean).join(" · ") : value;
  };

  if (!editing) {
    return (
      <div className="card">
        <div className="hd"><h3>Your details</h3><button className="btn ghost sm" onClick={() => setEditing(true)}><Icon name="edit" />Edit</button></div>
        <p className="ink2" style={{ fontSize: 13, marginBottom: 12 }}>This is what {firm} has on file about you. Your legal team and your medical providers see it, so keep it up to date.</p>
        {DETAILS.map((f) => (
          <div className="row r-kv" style={{ gridTemplateColumns: "170px minmax(0, 1fr)" }} key={f.key}>
            <span>{f.label}</span>
            <b style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{shown(f) ?? <span className="muted">Not on file</span>}</b>
          </div>
        ))}
        {client.updated && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>You last updated this on {day(client.updated)}.</p>}
      </div>
    );
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="hd"><h3>Edit your details</h3></div>
      <div className="fields">
        {DETAILS.map((f) => (
          <label className={f.wide ? "fld wide" : "fld"} key={f.key}>
            {f.label}
            <input name={f.key} type={f.type} defaultValue={client[f.key] ?? ""} maxLength={f.max} autoComplete={f.autoComplete} aria-invalid={errors[f.key] ? true : undefined} required />
            {errors[f.key] && <Status kind="warn" label={errors[f.key]!} />}
          </label>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={cancel} disabled={saving}>Cancel</button>
        <button className="btn" disabled={saving}><Icon name="check" />{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </form>
  );
}

// The rest of what the firm holds about the client: what happened and how they were hurt.
export function CardMyIncident() {
  const { openMessage } = useApp();
  const { incident, injuries, firm } = useClientCase();
  return (
    <div className="card">
      <div className="hd"><h3>Your incident and injuries</h3></div>
      <div className="sect" style={{ marginTop: 0 }}>Incident · {incident.date}</div>
      <p style={{ fontSize: 13.5 }}>{incident.type}. {incident.summary}{incident.location && <> <span className="ink2">{incident.location}.</span></>}</p>
      <div className="sect">Injuries</div>
      <InjuriesList injuries={injuries} withProvider />
      <p className="ink2" style={{ fontSize: 13, marginTop: 14 }}>These come from the case file and your medical records, so they can’t be changed here. If something looks wrong, tell your legal team.</p>
      <div className="actions">
        <button className="btn ghost" onClick={() => openMessage(firm)}><Icon name="msg" />Message your legal team</button>
      </div>
    </div>
  );
}

// How far along the case is: the step it is at, the one that comes next and when each step so far began.
export function CardMyCase() {
  const { stages, stageIndex: s } = useClientCase();
  const next = stages[s + 1];
  return (
    <div className="card">
      <div className="hd"><h3>Where your case stands</h3></div>
      <p className="lead">Your case is in <b>{stages[s].name.toLowerCase()}</b>, step {s + 1} of {stages.length}.{next ? <> Next comes <b>{next.name.toLowerCase()}</b>.</> : " This is the last step."}</p>
      <div className="sect">Steps so far</div>
      {stages.slice(0, s + 1).map((st) => (
        <div className="row r-kv" key={st.name}><span>{st.name}</span><b style={{ fontWeight: 500 }}>{st.date}</b></div>
      ))}
    </div>
  );
}

export function CardMyTeam() {
  const { team, firm } = useClientCase();
  return (
    <div className="card">
      <div className="hd"><h3>Your legal team</h3><span className="muted" style={{ fontSize: 13 }}>{firm}</span></div>
      {!team.length && <div className="empty">No one is assigned to your case yet.</div>}
      <TeamList team={team} />
    </div>
  );
}

// Who is treating the client for their injuries. These are the providers who see the client's details.
export function CardMyProviders() {
  const { providers } = useClientCase();
  return (
    <div className="card">
      <div className="hd"><h3>Your medical providers</h3></div>
      {!providers.length && <div className="empty">No medical providers on your case yet.</div>}
      {providers.map((p) => (
        <div className="row r-doc" key={p.name}><Icon name="users" /><div>{p.name}{p.since && <small>Treating you since {p.since}</small>}</div></div>
      ))}
    </div>
  );
}
