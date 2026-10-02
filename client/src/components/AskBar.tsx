"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useApp } from "./AppShell";
import { Icon } from "./Icon";
import { FirmOnly, Rich } from "./ui";

const SUGGESTED = ["What changed this week?", "How far apart are we?", "What's still missing?", "What's due next?"];

// The assistant, in the top bar of every view. The conversation drops down
// below the box while it's in use and closes on Escape or a click elsewhere.
export function AskBar() {
  const { chat, thinking, ask } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [chat, thinking, open]);

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

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
    ask(input.value);
    input.value = "";
    setOpen(true);
  }

  return (
    <div className="askbar" ref={box}>
      <form className="ask" onSubmit={submit}>
        <Icon name="spark" />
        <input name="q" placeholder="Ask anything about this case" autoComplete="off" aria-label="Ask about this case" onFocus={() => setOpen(true)} onClick={() => setOpen(true)} />
        <button aria-label="Send"><Icon name="send" /></button>
      </form>
      {open && (
        <div className="askpanel">
          <div className="hd"><h3>Ask about this case</h3><FirmOnly /></div>
          <div className="log" ref={log} aria-live="polite">
            {chat.map((m, i) => <div key={i} className={m.me ? "bubble me" : "bubble"}><Rich text={m.text} /></div>)}
            {thinking && <div className="bubble wait">Looking at the case…</div>}
          </div>
          <div className="chips">{SUGGESTED.map((q) => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div>
        </div>
      )}
    </div>
  );
}
