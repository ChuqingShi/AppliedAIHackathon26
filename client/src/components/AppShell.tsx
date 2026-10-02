"use client";

// CaseBoard: one dashboard, three roles. What it shows comes from `dashboard`,
// the record the server built for whoever is signed in. The shell owns
// everything that outlives a single view: search, the assistant's chat log,
// the message dialog, toasts and what the user has put on their overview.

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { askAssistant, login, logout, saveOverviewLayout } from "@/app/actions";
import { NAV } from "@/data/nav";
import type { Role } from "@/data/nav";
import type { Case, Dashboard, OverviewLayout, ProviderCase } from "@/data/types";
import { AskBar } from "./AskBar";
import { Icon } from "./Icon";
import { SearchResults } from "./SearchResults";

export interface ChatMessage { me?: boolean; text: string }
export interface DemoAccount { id: string; role: Role }

interface App {
  dashboard: Dashboard;
  overview: OverviewLayout;
  setOverview: (layout: OverviewLayout) => void;
  role: Role;
  view: string;
  query: string;
  setQuery: (q: string) => void;
  chat: ChatMessage[];
  thinking: boolean;
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

// The signed-in role's record. Each role's cards only ever render for that role.
export function useFirmCase(): Case {
  const { dashboard } = useApp();
  if (dashboard.role !== "firm") throw new Error("This card is for the law firm only");
  return dashboard.case;
}

export function useProviderCase(): ProviderCase {
  const { dashboard } = useApp();
  if (dashboard.role !== "provider") throw new Error("This card is for medical providers only");
  return dashboard.case;
}

export function AppShell({ dashboard, overview: savedOverview, demoAccounts, children }: { dashboard: Dashboard; overview: OverviewLayout; demoAccounts: DemoAccount[]; children: ReactNode }) {
  const params = useParams<{ view?: string }>();
  const pathname = usePathname();
  const role = dashboard.role;
  const view = params.view ?? "overview";

  // The search belongs to the page it was typed on, so back/forward clears it.
  const [search, setSearch] = useState({ text: "", path: "" });
  const query = search.path === pathname ? search.text : "";
  const setQuery = useCallback((text: string) => setSearch({ text, path: pathname }), [pathname]);

  const [chat, setChat] = useState<ChatMessage[]>(dashboard.role === "firm" ? [{ text: dashboard.briefing }] : []);
  const [asking, setAsking] = useState(0);
  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q) return;
    setChat((log) => [...log, { me: true, text: q }]);
    setAsking((n) => n + 1);
    try {
      const reply = await askAssistant(q);
      setChat((log) => [...log, { text: reply }]);
    } catch {
      setChat((log) => [...log, { text: "The assistant couldn't be reached. Try again in a moment." }]);
    } finally {
      setAsking((n) => n - 1);
    }
  }, []);

  const [toastState, setToastState] = useState({ text: "", show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((text: string) => {
    setToastState({ text, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState((t) => ({ ...t, show: false })), 2600);
  }, []);

  // A change to the overview shows at once; the save follows and the server sends back what it kept.
  const [overview, showOverview] = useOptimistic(savedOverview);
  const setOverview = useCallback((layout: OverviewLayout) => {
    startTransition(async () => {
      showOverview(layout);
      try {
        await saveOverviewLayout(layout);
      } catch {
        toast("Couldn’t save your overview. Try again in a moment.");
      }
    });
  }, [showOverview, toast]);

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
    () => ({ dashboard, overview, setOverview, role, view, query, setQuery, chat, thinking: asking > 0, ask, toast, openMessage: setMessageTo }),
    [dashboard, overview, setOverview, role, view, query, setQuery, chat, asking, ask, toast],
  );

  return (
    <AppContext.Provider value={app}>
      <div className="app">
        <aside className="side"><Sidebar demoAccounts={demoAccounts} /></aside>
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

// The few places the shell words things differently per role.
function frame(d: Dashboard) {
  switch (d.role) {
    case "firm": return {
      box: { label: "Case", title: d.case.shortTitle, sub: d.case.id },
      counts: { todo: d.case.tasks.filter((t) => t.urgent).length } as Record<string, number>,
    };
    case "provider": return {
      box: { label: "Patient", title: d.case.patient.name, sub: d.case.firm },
      counts: { records: d.case.requests.length } as Record<string, number>,
    };
    case "client": return {
      box: { label: "Your case", title: d.case.shortTitle, sub: d.case.firm },
      counts: {} as Record<string, number>,
    };
  }
}

const SHORT_ROLE: Record<Role, string> = { firm: "Law firm", provider: "Provider", client: "Client" };

function Sidebar({ demoAccounts }: { demoAccounts: DemoAccount[] }) {
  const { dashboard, role, view, query, setQuery } = useApp();
  const { user } = dashboard;
  const { box, counts } = frame(dashboard);
  const searching = query.trim() !== "";
  return (
    <>
      <div className="logo"><span><Icon name="shield" /></span>CaseBoard</div>
      <label className="search">
        <Icon name="search" />
        <input type="search" placeholder="Search this case" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </label>
      <div className="casebox"><small>{box.label}</small><b>{box.title}</b><span>{box.sub}</span></div>
      {NAV[role].map(({ id, label, icon }) => (
        <Link key={id} href={`/${id}`} className={view === id && !searching ? "nav on" : "nav"} onClick={() => setQuery("")}>
          <Icon name={icon} />{label}{counts[id] ? <span className="ct">{counts[id]}</span> : null}
        </Link>
      ))}
      <div className="foot">
        {/* Demo shortcut: signs in as the sample account for each role. */}
        <form className="demo" action={login}>
          <small>Demo · signed in as</small>
          <div className="seg">
            {demoAccounts.map((a) => (
              <button key={a.id} name="account" value={a.id} className={a.role === role ? "on" : ""} aria-pressed={a.role === role}>{SHORT_ROLE[a.role]}</button>
            ))}
          </div>
        </form>
        <div className="who">
          <span className="av">{user.initials}</span>
          <div>{user.name}<small>{user.title}</small></div>
          <form action={logout}><button className="out" aria-label="Sign out" title="Sign out"><Icon name="logout" /></button></form>
        </div>
      </div>
    </>
  );
}

// Stays put above every view: the assistant (firm only) and, under it, a quiet
// one-line progress bar. The case itself is named in the sidebar.
function StickyHeader() {
  const { dashboard } = useApp();
  const { stages, stageIndex: s } = dashboard.case;
  return (
    <div className="stick">
      {dashboard.role === "firm" && <AskBar />}
      <div className="prog" role="img" aria-label={`Case progress: stage ${s + 1} of ${stages.length}, ${stages[s].name}, ${stages[s].date}`}>
        <span className="stage">Stage {s + 1} of {stages.length}</span>
        {stages.map((st, i) => (
          <div key={st.name} className={`step ${i < s ? "done" : i === s ? "now" : "todo"}`} title={`${st.name} · ${st.date}`}>
            <span className="node" />
            <span className="nm">{st.name}</span>
            {i === s && <span className="dt">{st.date}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
