"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { sendInquiry } from "@/app/actions";
import { DETAILS } from "@/data/details";
import type { Role } from "@/data/nav";
import type { ChatMessage, Dashboard, Draft, Inquiry, Passage } from "@/data/types";
import { mainContact, useApp, useFirmCase } from "./AppShell";
import { day, recipients, when } from "./format";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { FirmOnly, Rich, money } from "./ui";

// Questions offered under the assistant, each answerable from that role's own record.
const SUGGESTED: Record<Role, string[]> = {
  firm: ["What changed this week?", "How far apart are we?", "What's still missing?", "What's due next?", "What are the latest injury updates?"],
  provider: ["What does the firm need from me?", "Where is the case?", "What's my lien balance?", "What's on file from me?", "Any questions for me?"],
  client: ["Where is my case?", "Who is working on my case?", "What details are on file for me?", "Who is treating me?", "Any questions for me?"],
};
const HINT_MS = 3200;
// The documents are searched once typing has paused this long, and from this many letters.
const SEARCH_MS = 250;
const SEARCH_FROM = 3;

interface Hit { label: string; sub: string; go: string; icon: IconName }

// The questions the firm sent a provider or the client, as search results.
const asked = (inquiries: Inquiry[]): Hit[] =>
  inquiries.map((q) => ({ label: q.message, sub: `Question from ${q.from} · ${day(q.sentAt.slice(0, 10))}`, go: "questions", icon: "msg" }));

// Search only looks at the record the signed-in role was given. A provider's
// leaves out the patient's personal details; the client's has no documents in it.
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
      ...p.requests.map((r) => ({ label: r.title, sub: `Needed from you · due ${r.due}`, go: "progress", icon: "task" as const })),
      ...d.uploads.map((u) => ({ label: u.fileName, sub: `Sent to the firm · ${when(u.uploadedAt)}`, go: "records", icon: "upload" as const })),
      ...asked(d.inquiries),
      { label: "Your bill and lien balance", sub: `Your bill · ${money(p.lien)}`, go: "records", icon: "dollar" },
    ];
  }
  const c = d.case;
  return [
    ...DETAILS.flatMap((f) => (c.client[f.key] ? [{ label: f.key === "dob" ? day(c.client.dob) : c.client[f.key]!, sub: `Your details · ${f.label}`, go: "profile", icon: "user" as const }] : [])),
    { label: `${c.incident.type}. ${c.incident.summary}`, sub: `Your incident · ${c.incident.date}`, go: "profile", icon: "cal" },
    ...c.injuries.map((j) => ({ label: j.name, sub: `Your injuries · ${j.status}`, go: "profile", icon: "user" as const })),
    ...c.team.map((m) => ({ label: m.name, sub: `Your legal team · ${m.role}`, go: "overview", icon: "users" as const })),
    ...c.providers.map((p) => ({ label: p.name, sub: p.since ? `Medical provider · treating you since ${p.since}` : "Medical provider", go: "overview", icon: "users" as const })),
    ...asked(d.inquiries),
    { label: c.stages[c.stageIndex].name, sub: `Where your case stands · stage ${c.stageIndex + 1} of ${c.stages.length}`, go: "overview", icon: "clock" },
  ];
}

// Opens the document at the page a passage is on.
const pageLink = (p: Passage) => `/api/documents/${p.docId}#page=${p.page}`;

// What the box can take, shown in turn as its placeholder. The examples are
// taken from the signed-in role's own record.
function hints(d: Dashboard): string[] {
  const like = (what: string, example?: string) => (example ? `${what}, like “${example}”` : null);
  const all = d.role === "firm" ? [
    like("Search documents", d.case.documents[0]?.name),
    like("Ask a question", SUGGESTED.firm[1]),
    like("Ask what a document says", d.case.documents[0]?.name),
    like("Find a medical provider", d.case.providers[0]?.name),
    like("Search to-dos", d.case.tasks[0]?.title),
    like("Ask the assistant", SUGGESTED.firm[0]),
    like("Look up an update", d.case.updates[0]?.firm.t),
    like("Search by person", d.case.client.name),
  ] : d.role === "provider" ? [
    like("Search your documents", d.case.documents[0]?.name),
    like("Ask a question", SUGGESTED.provider[0]),
    like("Look up an update", d.case.updates[0]?.t),
    like("Find someone on the legal team", d.case.team[0]?.name),
    like("Ask the assistant", SUGGESTED.provider[1]),
    like("Search the injuries on this case", d.case.injuries[0]?.name),
  ] : [
    like("Ask a question", SUGGESTED.client[0]),
    like("Find someone on your legal team", d.case.team[0]?.name),
    like("Look up who is treating you", d.case.providers[0]?.name),
    like("Ask the assistant", SUGGESTED.client[2]),
    like("Search your injuries", d.case.injuries[0]?.name),
  ];
  const usable = all.filter((h): h is string => h !== null);
  return usable.length ? usable : ["Search this case"];
}

// Under an answer: the message that asks whoever would know. It is open when the
// case doesn't hold the answer (`missing`), and one click away when it does. The
// firm can change who it goes to and what it says before sending; once sent, it
// is tracked under "Questions sent".
function AskSomeone({ asked, draft, missing, onLeave }: { asked: string; draft: Draft; missing: boolean; onLeave: () => void }) {
  const { dashboard } = useApp();
  const to = recipients(useFirmCase());
  const [open, setOpen] = useState(missing);
  const [who, setWho] = useState(draft.to);
  const [message, setMessage] = useState(draft.message);
  // Already sent from this answer (in this sitting, or before a reload): one of the questions out has it.
  const before = dashboard.inquiries.find((q) => q.asked === asked);
  const [state, setState] = useState<"draft" | "sending" | "sent" | "failed">(before ? "sent" : "draft");
  const name = state === "sent" && before ? before.to.name : to.find((r) => r.id === who)?.name;

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

// One past exchange with the assistant, as the history lists it: the question and
// when, opening to the answer and an "Ask again".
function HistoryItem({ asked, reply, onAsk }: { asked: ChatMessage; reply?: ChatMessage; onAsk: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "hist open" : "hist"}>
      <button type="button" className="hist-q" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="msg" sm /><span>{asked.text}</span>{asked.at && <small>{day(asked.at.slice(0, 10), false)}</small>}
      </button>
      {open && (
        <div className="hist-a">
          {reply ? <Rich text={reply.text} /> : <span className="muted">No answer was kept.</span>}
          {reply?.sources?.length ? (
            <div className="srcs">
              {reply.sources.map((p, n) => <a key={n} href={pageLink(p)} target="_blank" rel="noreferrer"><b>{n + 1}</b>{p.name}, p. {p.page}</a>)}
            </div>
          ) : null}
          <button type="button" className="asklink" onClick={() => onAsk(asked.text)}><Icon name="redo" sm />Ask again</button>
        </div>
      )}
    </div>
  );
}

// The one box in the top bar, for searching the case and asking the assistant.
// It is the same for the firm, a medical provider and the client; what differs
// is what it reaches, which is the record the server built for whoever is signed
// in. Two dropdowns open under it while there is something typed: matches in the
// case on the left, the assistant on the right. The clock button opens the
// history instead: everything asked before, which the box then searches. They
// close on Escape or a click elsewhere.
//
// For the firm the matches include the pages of the case's documents that say
// what was typed, the assistant answers from everything held on the case, and
// when the case doesn't hold the answer it offers a message to whoever would
// know. A provider and the client are matched and answered from their own record
// only, never from what the documents say, and are pointed to the legal team for
// what their record doesn't hold.
export function SearchBar() {
  const { dashboard, role, chat, thinking, ask, clearChat, openMessage } = useApp();
  // Only the firm's search reads the documents themselves (src/app/api/search/route.ts refuses anyone else).
  const readsDocuments = role === "firm";
  // Who a provider or the client is pointed to for what their record doesn't hold.
  const contact = dashboard.role === "firm" ? null : mainContact(dashboard.case.team, dashboard.case.firm);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  // Clearing the history takes a second click, so a slip doesn't lose it.
  const [sure, setSure] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const q = query.trim();
  const showing = open && (q !== "" || history);
  // Past exchanges, newest first, each question with the answer that followed it; narrowed by what is typed.
  const past = useMemo(() => {
    const items: { asked: ChatMessage; reply?: ChatMessage }[] = [];
    chat.forEach((m, i) => { const next = chat[i + 1]; if (m.me) items.push({ asked: m, reply: next && !next.me ? next : undefined }); });
    const needle = q.toLowerCase();
    return items.reverse().filter(({ asked, reply }) => !needle || `${asked.text} ${reply?.text ?? ""}`.toLowerCase().includes(needle));
  }, [chat, q]);
  const index = useMemo(() => searchIndex(dashboard), [dashboard]);
  const hits = index.filter((x) => (x.label + " " + x.sub).toLowerCase().includes(q.toLowerCase()));
  const lastAsked = chat.findLast((m) => m.me)?.text;

  // What the documents say about what is typed, looked up once typing pauses.
  // The last pages found stay up until the next ones arrive.
  const [found, setFound] = useState<Passage[]>([]);
  const searching = readsDocuments && q.length >= SEARCH_FROM;
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
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setHistory(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setHistory(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (history) return;
    if (q) ask(q);
    setOpen(true);
  }

  // Following a result leaves the search behind.
  function leave() {
    setQuery("");
    setOpen(false);
    setHistory(false);
  }

  // From the history, a question is asked afresh in the ordinary view.
  function askAgain(question: string) {
    setHistory(false);
    setQuery(question);
    setOpen(true);
    ask(question);
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
            aria-label={history ? "Search your history" : "Search or ask about this case"}
            autoComplete="off"
          />
          {!query && <span className="ph" key={history ? "history" : tip} aria-hidden="true">{history ? "Search what you asked before" : tips[tip % tips.length]}</span>}
        </div>
        <button type="button" className={history ? "hist-btn on" : "hist-btn"} aria-pressed={history} aria-label="Search history" title="Search history"
          onClick={() => { setHistory(!history); setOpen(true); }}><Icon name="clock" /></button>
        <button aria-label="Ask the assistant" title="Ask the assistant"><Icon name="spark" /></button>
      </form>
      {showing && history && (
        <div className="drops">
          <div className="drop">
            <div className="hd">
              <h3>Your history</h3>
              <span className="muted">
                {past.length} {past.length === 1 ? "question" : "questions"}
                {past.length > 0 && !q && (sure
                  ? <> · Forget all of it? <button type="button" className="link" onClick={() => { setSure(false); clearChat(); }}>Yes, clear</button> · <button type="button" className="link" onClick={() => setSure(false)}>Keep</button></>
                  : <> · <button type="button" className="link" onClick={() => setSure(true)}>Clear</button></>)}
              </span>
            </div>
            <div className="hits">
              {past.map((item, i) => <HistoryItem key={`${item.asked.at ?? i}-${i}`} asked={item.asked} reply={item.reply} onAsk={askAgain} />)}
              {!past.length && <div className="empty">{q ? "Nothing you asked before matches that." : "Nothing asked yet. What you ask the assistant is kept here, so you can come back to it."}</div>}
            </div>
          </div>
        </div>
      )}
      {showing && !history && (
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
          <div className="drop">
            <div className="hd"><h3>Assistant</h3>{role === "firm" ? <FirmOnly /> : <span className="tag shared"><Icon name="lock" sm />Your record only</span>}</div>
            <div className="log" ref={log} aria-live="polite">
              {chat.map((m, i) => (
                <div key={i} className={m.me ? "bubble me" : "bubble"}>
                  {/* a new day in the conversation */}
                  {m.me && m.at && day(m.at.slice(0, 10)) !== day(chat.slice(0, i).findLast((x) => x.me && x.at)?.at?.slice(0, 10) ?? "") && <small className="when">{day(m.at.slice(0, 10))}</small>}
                  <Rich text={m.text} />
                  {m.sources?.length ? (
                    <div className="srcs">
                      {m.sources.map((p, n) => <a key={n} href={pageLink(p)} target="_blank" rel="noreferrer" title={p.snippet.replaceAll("**", "")}><b>{n + 1}</b>{p.name}, p. {p.page}</a>)}
                    </div>
                  ) : null}
                  {m.draft && m.asked ? <AskSomeone asked={m.asked} draft={m.draft} missing={Boolean(m.missing)} onLeave={leave} /> : null}
                  {/* What a provider's or the client's record doesn't hold, their legal team would know. */}
                  {contact && m.missing ? <button className="asklink" onClick={() => { leave(); openMessage(contact); }}><Icon name="msg" sm />Message {contact} about this</button> : null}
                </div>
              ))}
              {thinking && <div className="bubble wait">Looking at the case…</div>}
            </div>
            {q !== lastAsked && <button className="asknow" onClick={() => ask(q)}><Icon name="spark" sm /><span>Press Enter to ask “{q}”</span></button>}
            <div className="chips">{SUGGESTED[role].map((s) => <button key={s} onClick={() => { setQuery(s); ask(s); }}>{s}</button>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
