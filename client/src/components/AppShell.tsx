"use client";

// CaseBoard: one dashboard, two roles. The shell owns everything that outlives
// a single view: search, the assistant's chat log, the message dialog and toasts.

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { NAV, isRole } from "@/data/nav";
import type { Role } from "@/data/nav";
import { answer, briefing } from "./assistant";
import { useCaseData } from "./CaseData";
import { Icon } from "./Icon";
import { SearchResults } from "./SearchResults";

export interface ChatMessage { me?: boolean; body: ReactNode }

interface App {
  role: Role;
  view: string;
  query: string;
  setQuery: (q: string) => void;
  chat: ChatMessage[];
  ask: (question: string) => void;
  toast: (text: string) => void;
  openMessage: (name: string) => void;
}

const AppContext = createContext<App | null>(null);

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp must be used inside <AppShell>");
  return app;
}

export function AppShell({ children }: { children: ReactNode }) {
  const params = useParams<{ role?: string; view?: string }>();
  const pathname = usePathname();
  const role: Role = isRole(params.role) ? params.role : "firm";
  const view = params.view ?? "overview";

  // The search belongs to the page it was typed on, so back/forward clears it.
  const [search, setSearch] = useState({ text: "", path: "" });
  const query = search.path === pathname ? search.text : "";
  const setQuery = useCallback((text: string) => setSearch({ text, path: pathname }), [pathname]);

  // The assistant is firm-only; it answers from the loaded case record.
  const data = useCaseData();
  const firmCase = data.role === "firm" ? data.case : null;
  const [chat, setChat] = useState<ChatMessage[]>(() => (firmCase ? [{ body: briefing(firmCase) }] : []));
  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q || !firmCase) return;
    setChat((log) => [...log, { me: true, body: q }, { body: answer(firmCase, q) }]);
  }, [firmCase]);

  const [toastState, setToastState] = useState({ text: "", show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((text: string) => {
    setToastState({ text, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState((t) => ({ ...t, show: false })), 2600);
  }, []);

  const [messageTo, setMessageTo] = useState<string | null>(null);
  useEffect(() => {
    if (!messageTo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMessageTo(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [messageTo]);

  function sendMessage(e: FormEvent) {
    e.preventDefault();
    toast(`Message to ${messageTo} sent (prototype: not delivered)`);
    setMessageTo(null);
  }

  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.scrollTo(0, 0); }, [pathname]);

  const app = useMemo<App>(
    () => ({ role, view, query, setQuery, chat, ask, toast, openMessage: setMessageTo }),
    [role, view, query, setQuery, chat, ask, toast],
  );

  return (
    <AppContext.Provider value={app}>
      <div className="app">
        <aside className="side"><Sidebar /></aside>
        <main className="main" ref={main}>
          <StickyHeader />
          <div className="content">{query.trim() ? <SearchResults /> : children}</div>
        </main>
      </div>
      <div id="overlay" className={messageTo ? "open" : ""} onClick={(e) => { if (e.target === e.currentTarget) setMessageTo(null); }}>
        {messageTo && (
          <form className="dialog" onSubmit={sendMessage}>
            <h3>Message {messageTo}</h3>
            <textarea placeholder="Write your message…" required autoFocus />
            <div className="rw">
              <button type="button" className="btn ghost" onClick={() => setMessageTo(null)}>Cancel</button>
              <button className="btn"><Icon name="send" />Send</button>
            </div>
          </form>
        )}
      </div>
      <div className={toastState.show ? "toast show" : "toast"} role="status">{toastState.text}</div>
    </AppContext.Provider>
  );
}

function Sidebar() {
  const { role, view, query, setQuery } = useApp();
  const data = useCaseData();
  const firm = role === "firm";
  const user = data.case.user;
  const counts: Record<string, number> = data.role === "firm"
    ? { todo: data.case.tasks.filter((t) => t.urgent).length }
    : { records: data.case.requests.length };
  const searching = query.trim() !== "";
  return (
    <>
      <div className="logo"><span><Icon name="shield" /></span>CaseBoard</div>
      <label className="search">
        <Icon name="search" />
        <input type="search" placeholder="Search this case" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </label>
      <div className="casebox">
        {data.role === "firm"
          ? <><small>Case</small><b>{data.case.title}</b><span>{data.case.id}</span></>
          : <><small>Patient</small><b>{data.case.patient.name}</b><span>{data.case.firm}</span></>}
      </div>
      {NAV[role].map(({ id, label, icon }) => (
        <Link key={id} href={`/${role}/${id}`} className={view === id && !searching ? "nav on" : "nav"} onClick={() => setQuery("")}>
          <Icon name={icon} />{label}{counts[id] ? <span className="ct">{counts[id]}</span> : null}
        </Link>
      ))}
      <div className="foot">
        <div className="demo">
          <small>Demo · signed in as</small>
          <div className="seg">
            <Link href="/firm/overview" className={firm ? "on" : ""}>Law firm</Link>
            <Link href="/provider/overview" className={firm ? "" : "on"}>Medical provider</Link>
          </div>
        </div>
        <div className="who"><span className="av">{user.initials}</span><div>{user.name}<small>{user.role}</small></div></div>
      </div>
    </>
  );
}

function StickyHeader() {
  const data = useCaseData();
  const { stages, stageIndex: s } = data.case;
  return (
    <div className="stick">
      <div className="sh">
        <h1>{data.role === "firm" ? data.case.title : `${data.case.patient.name} — injury case`}</h1>
        <span className="meta">{data.role === "firm" ? `Case ${data.case.id} · Client ${data.case.client.name}` : `${data.case.firm} · Case ${data.case.id}`}</span>
        <span className="chip">Stage {s + 1} of {stages.length} · {stages[s].name}</span>
      </div>
      <div className="prog" role="img" aria-label={`Case progress: stage ${s + 1} of ${stages.length}, ${stages[s].name}`}>
        {stages.map((st, i) => (
          <div key={st.name} className={`step ${i < s ? "done" : i === s ? "now" : "todo"}`}>
            <div className="node">{i < s ? <Icon name="check" /> : i + 1}</div>
            <div className="nm">{st.name}</div><div className="dt">{st.date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
