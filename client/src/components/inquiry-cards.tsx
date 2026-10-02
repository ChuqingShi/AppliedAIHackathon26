"use client";

// Questions the firm sends out when the case doesn't hold an answer. The firm
// sees every one with how far it has got (sent, seen, answered); a medical
// provider or the client sees the ones sent to them, with a box to answer in.

import { useEffect, useState, useTransition } from "react";
import { answerInquiry, closeInquiry, seeInquiries } from "@/app/actions";
import type { Inquiry } from "@/data/types";
import { useApp } from "./AppShell";
import { unanswered, when } from "./format";
import { Icon } from "./Icon";
import { FirmOnly, Go } from "./ui";

// A time in the reader's own time zone, which the server can't know when it renders.
function When({ at }: { at: string }) {
  return <time dateTime={at} suppressHydrationWarning>{when(at)}</time>;
}

// What a provider can answer with in one click, then add to. The client writes their own.
const QUICK = [
  "No change since the last visit on file.",
  "There is an update; the notes from the latest visit are below.",
  "We will send the updated records this week.",
];

// How far a question has got, as three steps.
function Progress({ q }: { q: Inquiry }) {
  const steps: [string, string | null][] = [["Sent", q.sentAt], ["Seen", q.seenAt], ["Answered", q.repliedAt]];
  return (
    <div className="q-steps" role="img" aria-label={`${q.reply ? "Answered" : q.seenAt ? "Seen, not answered yet" : "Sent, not seen yet"}`}>
      {steps.map(([label, at]) => (
        <span key={label} className={at ? "done" : ""}><i>{at && <Icon name="check" sm />}</i>{label}{at && <small><When at={at} /></small>}</span>
      ))}
    </div>
  );
}

// The firm's side: every question sent, the newest first, then the closed ones.
export function CardQuestionsSent({ limit }: { limit?: number }) {
  const { dashboard, toast } = useApp();
  const [closing, startClosing] = useTransition();
  const open = dashboard.inquiries.filter((q) => !q.closedAt);
  const closed = limit ? [] : dashboard.inquiries.filter((q) => q.closedAt);
  const list = limit ? open.slice(0, limit) : open;

  function close(id: number) {
    startClosing(async () => {
      try { await closeInquiry(id); } catch { toast("Couldn’t close that question. Try again in a moment."); }
    });
  }

  return (
    <div className="card">
      <div className="hd"><h3>Questions sent</h3>{limit ? <Go to="questions">All questions</Go> : <FirmOnly />}</div>
      {!open.length && <div className="empty">No questions out. When the assistant can&apos;t find something on the case, it drafts a message to whoever would know, and the answer is tracked here.</div>}
      {list.map((q) => (
        <div className="q" key={q.id}>
          <div className="q-hd"><b>{q.to.name}</b>{q.reply && <span className="tag closed"><i aria-hidden="true" />New answer</span>}</div>
          {q.asked && <div className="q-asked">You asked the assistant: “{q.asked}”</div>}
          <p className={limit ? "q-msg cut" : "q-msg"}>{q.message}</p>
          <Progress q={q} />
          {q.reply && (
            <div className="q-reply">
              <small>{q.repliedBy ?? q.to.name} answered</small>
              <p>{q.reply}</p>
              <button className="btn ghost sm" disabled={closing} onClick={() => close(q.id)}><Icon name="check" />Got it</button>
            </div>
          )}
        </div>
      ))}
      {limit && open.length > limit ? <Go to="questions">{open.length - limit} more</Go> : null}
      {closed.length > 0 && <div className="sect">Closed</div>}
      {closed.map((q) => (
        <div className="q done" key={q.id}>
          <div className="q-hd"><b>{q.to.name}</b><small className="ink2">Sent <When at={q.sentAt} /></small></div>
          <p className="q-msg">{q.message}</p>
          {q.reply && <div className="q-reply"><small>{q.repliedBy ?? q.to.name} answered <When at={q.repliedAt!} /></small><p>{q.reply}</p></div>}
        </div>
      ))}
    </div>
  );
}

// One question as its recipient sees it: the message, and a box to answer in until they have.
function QuestionForYou({ q, quick }: { q: Inquiry; quick: string[] }) {
  const { toast } = useApp();
  const [text, setText] = useState("");
  const [sending, startSending] = useTransition();

  function send() {
    startSending(async () => {
      try {
        await answerInquiry(q.id, text);
        toast(`Your answer was sent to ${q.from}`);
      } catch {
        toast("Couldn’t send your answer. Try again in a moment.");
      }
    });
  }

  return (
    <div className="q">
      <div className="q-hd"><b>{q.from}</b><small className="ink2"><When at={q.sentAt} /></small></div>
      <p className="q-msg">{q.message}</p>
      {q.reply ? (
        <div className="q-reply"><small>You answered <When at={q.repliedAt!} /></small><p>{q.reply}</p></div>
      ) : q.closedAt ? (
        <div className="q-reply"><small>The legal team no longer needs this.</small></div>
      ) : (
        <form className="q-answer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {quick.length > 0 && (
            <div className="chips">{quick.map((line) => <button type="button" key={line} onClick={() => setText(line)}>{line}</button>)}</div>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer…" aria-label={`Your answer to ${q.from}`} required />
          <div className="rw"><button className="btn sm" disabled={sending || !text.trim()}><Icon name="send" />{sending ? "Sending…" : "Send answer"}</button></div>
        </form>
      )}
    </div>
  );
}

// A provider's or the client's side: what the legal team has asked them, the
// unanswered first. Showing them counts as having seen them, which the firm is told.
export function CardQuestionsForYou({ limit }: { limit?: number }) {
  const { dashboard } = useApp();
  const { inquiries } = dashboard;
  const waiting = unanswered(inquiries);
  const rest = limit ? [] : inquiries.filter((q) => q.reply || q.closedAt);

  const unseen = inquiries.some((q) => !q.seenAt);
  useEffect(() => { if (unseen) seeInquiries().catch(() => {}); }, [unseen]);

  const quick = dashboard.role === "provider" ? QUICK : [];
  return (
    <div className="card">
      <div className="hd">
        <h3>Questions from your legal team</h3>
        {waiting.length > 0 ? <span className="tag open"><i aria-hidden="true" />{waiting.length} to answer</span> : limit ? <Go to="questions">All questions</Go> : null}
      </div>
      {!waiting.length && <div className="empty">Nothing is waiting on you. Questions from the legal team show up here, and you can answer them right on this card.</div>}
      {waiting.map((q) => <QuestionForYou key={q.id} q={q} quick={quick} />)}
      {rest.length > 0 && <div className="sect">Answered</div>}
      {rest.map((q) => <QuestionForYou key={q.id} q={q} quick={quick} />)}
    </div>
  );
}
