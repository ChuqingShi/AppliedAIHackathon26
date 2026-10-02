"use client";

// CaseBoard: one dashboard, three roles. What it shows comes from `dashboard`,
// the record the server built for whoever is signed in. The shell owns
// everything that outlives a single view: the assistant's chat log,
// the message dialog, toasts and what the user has put on their overview.

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { askAssistant, currentAccount, dismissBriefing, login, logout, saveOverviewLayout } from "@/app/actions";
import { NAV } from "@/data/nav";
import type { Role } from "@/data/nav";
import type { Case, ClientCase, Dashboard, OverviewLayout, ProviderCase } from "@/data/types";
import { Icon } from "./Icon";
import { SearchBar } from "./SearchBar";

export interface ChatMessage { me?: boolean; text: string }
export interface DemoAccount { id: string; role: Role }

interface App {
  dashboard: Dashboard;
  overview: OverviewLayout;
  setOverview: (layout: OverviewLayout) => void;
  role: Role;
  view: string;
  chat: ChatMessage[];
  thinking: boolean;
  ask: (question: string) => void;
  toast: (text: string) => void;
  openMessage: (name: string) => void;
  // The firm's sign-in briefing (components/Briefing.tsx): open until closed once.
  briefingOpen: boolean;
  closeBriefing: () => void;
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

export function useClientCase(): ClientCase {
  const { dashboard } = useApp();
  if (dashboard.role !== "client") throw new Error("This card is for the client only");
  return dashboard.case;
}

// The whole browser shares one sign-in, so signing in as someone else in another
// tab leaves this one showing the last account's sidebar, whose links the new
// account may not have. When that happens, start again at the overview as
// whoever is signed in now.
function startOver() {
  window.location.replace("/overview");
}

// Wraps what each page renders. `user` is the account the server saw for that
// request; if the shell was built for a different one, nothing shows until it reloads.
export function SignedInAs({ user, children }: { user: string; children: ReactNode }) {
  const stale = useApp().dashboard.user.id !== user;
  useEffect(() => { if (stale) startOver(); }, [stale]);
  return stale ? null : children;
}

// For where the server hasn't just said who is signed in: asks it, and starts
// over unless it is still `user`, the account this tab shows.
export async function checkSignedInAs(user: string) {
  const now = await currentAccount();
  if (now !== user) startOver();
  return now === user;
}

export function AppShell({ dashboard, overview: savedOverview, demoAccounts, briefing = false, children }: { dashboard: Dashboard; overview: OverviewLayout; demoAccounts: DemoAccount[]; briefing?: boolean; children: ReactNode }) {
  const params = useParams<{ view?: string }>();
  const pathname = usePathname();
  const role = dashboard.role;
  const view = params.view ?? "overview";

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

  // Closing the briefing hides it at once and tells the server, so a refresh doesn't reopen it.
  const [briefingOpen, setBriefingOpen] = useState(briefing);
  const closeBriefing = useCallback(() => {
    setBriefingOpen(false);
    dismissBriefing().catch(() => {});
  }, []);

  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.scrollTo(0, 0); }, [pathname]);

  // Coming back to this tab: check it still shows the account that is signed in.
  const userId = dashboard.user.id;
  useEffect(() => {
    const check = () => { checkSignedInAs(userId).catch(() => {}); };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [userId]);

  const app = useMemo<App>(
    () => ({ dashboard, overview, setOverview, role, view, chat, thinking: asking > 0, ask, toast, openMessage: setMessageTo, briefingOpen, closeBriefing }),
    [dashboard, overview, setOverview, role, view, chat, asking, ask, toast, briefingOpen, closeBriefing],
  );

  return (
    <AppContext.Provider value={app}>
      <div className="app">
        <aside className="side"><Sidebar demoAccounts={demoAccounts} /></aside>
        <main className="main" ref={main}>
          <StickyHeader />
          <div className="content">{children}</div>
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

// The firm's key case dates for the sidebar box, in short form: when the case
// started, when it ended (or that it's still open) and the statute of limitations.
function caseDates(c: Case): [string, ReactNode][] {
  const { opened, closed } = c.dates;
  const d = c.deadline;
  return ([
    ["Opened", opened],
    ["Closed", closed || opened ? <CaseStatusBadge closed={closed} /> : null],
    ["Deadline", d ? `${d.date}${d.met ? " · met" : d.daysLeft >= 0 ? ` · ${d.daysLeft}d left` : " · passed"}` : "Not set"],
  ] as [string, ReactNode][]).filter((r) => r[1] != null);
}

// Whether the case is still running, as a badge: yellow "Still open" while Clio has
// no close date, green with the close date once it has one. Shared with the Case details card.
export function CaseStatusBadge({ closed }: { closed: string | null }) {
  return closed
    ? <span className="tag closed"><i aria-hidden="true" />{closed}</span>
    : <span className="tag open"><i aria-hidden="true" />Still open</span>;
}

// The few places the shell words things differently per role.
function frame(d: Dashboard) {
  switch (d.role) {
    case "firm": return {
      box: { label: "Case", title: d.case.shortTitle, sub: d.case.id, dates: caseDates(d.case) },
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
  const { dashboard, role, view } = useApp();
  const { user } = dashboard;
  const { box, counts } = frame(dashboard);
  return (
    <>
      <div className="logo"><span><Icon name="shield" /></span>CaseBoard</div>
      <div className="casebox">
        <small>{box.label}</small><b>{box.title}</b><span>{box.sub}</span>
        {box.dates && (
          <dl>{box.dates.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        )}
      </div>
      {NAV[role].map(({ id, label, icon }) => (
        <Link key={id} href={`/${id}`} className={view === id ? "nav on" : "nav"}>
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

// Stays put above every view: the search box (which is also how the firm asks
// the assistant) and, under it, a quiet one-line progress bar. The case itself is named in the sidebar.
function StickyHeader() {
  const { dashboard } = useApp();
  const { stages, stageIndex: s } = dashboard.case;
  return (
    <div className="stick">
      <SearchBar />
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
