"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { sendInquiry } from "@/app/actions";
import type { Dashboard, Draft, Passage } from "@/data/types";
import { useApp, useFirmCase } from "./AppShell";
import { recipients } from "./format";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { FirmOnly, Rich, money } from "./ui";

const SUGGESTED = ["What changed this week?", "How far apart are we?", "What's still missing?", "What's due next?", "What are the latest injury updates?"];
const HINT_MS = 3200;
// The documents are searched once typing has paused this long, and from this many letters.
const SEARCH_MS = 250;
const SEARCH_FROM = 3;

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

// Opens the document at the page a passage is on.
const pageLink = (p: Passage) => `/api/documents/${p.docId}#page=${p.page}`;

// What the box can take, shown in turn as its placeholder. The examples are
// taken from the signed-in role's own record.
function hints(d: Dashboard): string[] {
  const like = (what: string, example?: string) => (example ? `${what}, like “${example}”` : null);
  const all = d.role === "firm" ? [
    like("Search documents", d.case.documents[0]?.name),
    like("Ask a question", SUGGESTED[1]),
    like("Ask what a document says", d.case.documents[0]?.name),
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

// Under an answer: the message that asks whoever would know. It is open when the
// case doesn't hold the answer (`missing`), and one click away when it does. The
// firm can change who it goes to and what it says before sending; once sent, it
// is tracked under "Questions sent".
function AskSomeone({ asked, draft, missing, onLeave }: { asked: string; draft: Draft; missing: boolean; onLeave: () => void }) {
  const to = recipients(useFirmCase());
  const [open, setOpen] = useState(missing);
  const [who, setWho] = useState(draft.to);
  const [message, setMessage] = useState(draft.message);
  const [state, setState] = useState<"draft" | "sending" | "sent" | "failed">("draft");
  const name = to.find((r) => r.id === who)?.name;

  async function send(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      await sendInquiry(asked, who, message);
      setState("sent");
    } catch {
      setState("failed");
    }
  }

  if (state === "sent") {
    return <div className="asked"><Icon name="check" sm /><span>Sent to <b>{name}</b>. Their answer will show under <Link href="/questions" onClick={onLeave}>Questions sent</Link>.</span></div>;
  }
  if (!open) return <button className="asklink" onClick={() => setOpen(true)}><Icon name="msg" sm />Ask someone for this instead</button>;
  return (
    <form className="draft" onSubmit={send}>
      <label>Send to
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          {to.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.what.toLowerCase()})</option>)}
        </select>
      </label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message" required />
      {state === "failed" && <small className="err">Couldn&apos;t send it. Try again in a moment.</small>}
      <div className="rw">
        {!missing && <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>}
        <button className="btn sm" disabled={state === "sending" || !message.trim()}><Icon name="send" />{state === "sending" ? "Sending…" : "Send message"}</button>
      </div>
    </form>
  );
}

// The one box in the top bar, for searching the case and (for the firm) asking
// the assistant. Two dropdowns open under it while there is something typed:
// matches in the case on the left, the assistant on the right. For the firm the
// matches include the pages of the case's documents that say what was typed,
// and the assistant answers from everything held on the case. When the case
// doesn't hold the answer, it offers a message to whoever would know. They close
// on Escape or a click elsewhere.
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

  // What the documents say about what is typed, looked up once typing pauses.
  // The last pages found stay up until the next ones arrive.
  const [found, setFound] = useState<Passage[]>([]);
  const searching = canAsk && q.length >= SEARCH_FROM;
  useEffect(() => {
    if (!searching) return;
    const stop = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: stop.signal });
        if (res.ok) setFound(await res.json());
      } catch {
        // Overtaken by the next keystroke, or offline: what is shown stays.
      }
    }, SEARCH_MS);
    return () => { clearTimeout(timer); stop.abort(); };
  }, [searching, q]);
  const pages = searching ? found : [];
  const matches = hits.length + pages.length;

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
            <div className="hd"><h3>In this case</h3><span className="muted">{matches} {matches === 1 ? "match" : "matches"}</span></div>
            <div className="hits">
              {hits.map((h, i) => (
                <Link key={i} href={`/${h.go}`} className="row r-doc" onClick={leave}>
                  <Icon name={h.icon} /><div>{h.label}<small>{h.sub}</small></div><span className="link">Open</span>
                </Link>
              ))}
              {pages.length > 0 && <div className="th">In the documents</div>}
              {pages.map((p) => (
                <a key={`${p.docId}-${p.page}`} href={pageLink(p)} target="_blank" rel="noreferrer" className="row r-doc">
                  <Icon name="doc" /><div>{p.name}, page {p.page}<small><Rich text={p.snippet} /></small></div><span className="link">Open</span>
                </a>
              ))}
              {!matches && <div className="empty">Nothing on this case matches that search.</div>}
            </div>
          </div>
          {canAsk && (
            <div className="drop">
              <div className="hd"><h3>Assistant</h3><FirmOnly /></div>
              <div className="log" ref={log} aria-live="polite">
                {chat.map((m, i) => (
                  <div key={i} className={m.me ? "bubble me" : "bubble"}>
                    <Rich text={m.text} />
                    {m.sources?.length ? (
                      <div className="srcs">
                        {m.sources.map((p, n) => <a key={n} href={pageLink(p)} target="_blank" rel="noreferrer" title={p.snippet.replaceAll("**", "")}><b>{n + 1}</b>{p.name}, p. {p.page}</a>)}
                      </div>
                    ) : null}
                    {m.draft && m.asked ? <AskSomeone asked={m.asked} draft={m.draft} missing={Boolean(m.missing)} onLeave={leave} /> : null}
                  </div>
                ))}
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
