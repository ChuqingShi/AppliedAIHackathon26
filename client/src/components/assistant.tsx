import type { ReactNode } from "react";
import type { Case } from "@/data/case";
import { money } from "./format";

export const SUGGESTED = ["What changed recently?", "What are the numbers?", "What's still missing?", "What's due next?"];

// A short catch-up built from the latest updates and the next open task.
export function briefing(c: Case): ReactNode {
  const latest = c.updates.slice(0, 2);
  const next = c.tasks[0];
  return (
    <>
      {latest.length > 0 && <>Latest: {latest.map((u, i) => <span key={i}>{i > 0 && "; "}<b>{u.firm.t}</b> ({u.date})</span>)}. </>}
      {next && <>Next due: <b>{next.title}</b>, {next.due}.</>}
      {!latest.length && !next && "Nothing has been recorded on this case yet."}
    </>
  );
}

// Keyword answers over the case record, so the box is clickable in the demo.
// Replace with a call to the backend (which calls the model with the case
// record) when this is built.
export function answer(c: Case, q: string): ReactNode {
  const t = q.toLowerCase();
  const F = c.financials;
  const overdue = c.tasks.filter((x) => x.urgent);
  if (/miss|outstanding|waiting|still need/.test(t)) {
    const waiting = c.providers.filter((p) => p.bill === "warn" || p.records === "warn");
    if (!waiting.length && !overdue.length) return "Nothing is outstanding right now.";
    return <>{waiting.length > 0 && <>Waiting on <b>{waiting.map((p) => p.name).join(", ")}</b>. </>}{overdue.length > 0 && <>{overdue.length} to-do{overdue.length > 1 ? "s are" : " is"} due within a week or overdue, starting with <b>{overdue[0].title}</b> ({overdue[0].due}).</>}</>;
  }
  if (/due|next|task|to-?do|deadline/.test(t)) {
    const next = c.tasks.slice(0, 2);
    return <>{next.length ? <>Next up: {next.map((x, i) => <span key={i}>{i > 0 && ", then "}<b>{x.title}</b> ({x.due})</span>)}. </> : "No open to-dos. "}{c.deadline && <>{c.deadline.label}: {c.deadline.date}{c.deadline.met ? " (satisfied)" : `, ${c.deadline.daysLeft} days away`}.</>}</>;
  }
  if (/apart|gap|offer|demand|target|settle|money|financ|worth|number|value/.test(t)) {
    const parts: ReactNode[] = [];
    if (F.offer != null) parts.push(<>Their offer is <b>{money(F.offer)}</b>.</>);
    if (F.demand != null) parts.push(<>Our demand is <b>{money(F.demand)}</b>.</>);
    if (F.estimatedValue != null) parts.push(<>Estimated case value is <b>{money(F.estimatedValue)}</b>.</>);
    if (F.policyLimit != null) parts.push(<>Policy limit is <b>{money(F.policyLimit)}</b>.</>);
    parts.push(<>Medical bills total <b>{money(c.billsTotal)}</b>.</>);
    return <>{parts.map((p, i) => <span key={i}>{p} </span>)}{F.note}</>;
  }
  if (/client|phone|call|contact|injur/.test(t)) {
    const cl = c.client;
    return <><b>{cl.name}</b>{cl.age != null && <>, {cl.age}</>}.{cl.phone && <> Phone {cl.phone}.</>} Injuries: {c.injuries.map((j) => j.name).join("; ") || "none recorded"}.</>;
  }
  if (/provider|bill|lien|medical|record/.test(t)) return <>Medical bills total <b>{money(c.billsTotal)}</b> across {c.providers.length} providers.{F.liens != null && <> Asserted lien: {money(F.liens)}.</>}</>;
  if (/chang|new|week|update|happen|summary|catch|recent/.test(t)) return briefing(c);
  return "I can answer what changed, what the numbers are, what is missing, or what is due next.";
}
