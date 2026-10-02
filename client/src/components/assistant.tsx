import type { ReactNode } from "react";
import { CASE, F, billsTotal } from "@/data/case";
import { money } from "./format";

export const BRIEFING: ReactNode = (
  <>Since Monday: the insurer made a first offer of <b>{money(F.offer)}</b> against our <b>{money(F.demand)}</b> demand and is questioning the shoulder surgery. Summit Orthopedics owes a narrative report by Oct 8. <b>Counteroffer is due {F.counterDue}.</b></>
);
export const SUGGESTED = ["What changed this week?", "How far apart are we?", "What's still missing?", "What's due next?"];

// Canned answers so the box is clickable in the demo. Replace with a call to
// the backend (which calls the model with the case record) when this is built.
export function answer(q: string): ReactNode {
  const t = q.toLowerCase();
  if (/miss|outstanding|waiting|still need/.test(t)) return <>Two things are outstanding: the <b>final bill from Harbor Pain Management</b> (Priya is chasing it, due Mon, Oct 5) and the <b>narrative report from Summit Orthopedics</b> (due Thu, Oct 8).</>;
  if (/due|next|task|to-?do|deadline/.test(t)) return <>Next up: <b>call the client</b> about the offer (Mon, Oct 5), then <b>send the counteroffer</b> ({F.counterDue}). The filing deadline is {CASE.deadline.date}, {CASE.deadline.daysLeft} days away.</>;
  if (/apart|gap|offer|demand|target|settle|money|financ|worth/.test(t)) return <>Their offer is <b>{money(F.offer)}</b>; our demand is <b>{money(F.demand)}</b>. Our target range is {money(F.targetLow)} – {money(F.targetHigh)}, so the gap to the low end is <b>{money(F.targetLow - F.offer)}</b>. The planned counter is {money(F.counter)}.</>;
  if (/client|maria|phone|call|contact|injur/.test(t)) return <><b>{CASE.client.name}</b>, {CASE.client.age}. Best reached at {CASE.client.phone}, {CASE.client.bestTime.toLowerCase()}. Injuries: rotator cuff tear (surgery May 12), neck strain, lower back strain.</>;
  if (/provider|bill|lien|medical|record/.test(t)) return <>Medical bills total <b>{money(billsTotal)}</b> across {CASE.providers.length} providers. Records are in from all of them; one final bill (Harbor Pain Management) is still pending.</>;
  if (/chang|new|week|update|happen|summary|catch/.test(t)) return BRIEFING;
  return "This prototype only has sample answers. Try asking what changed, how far apart the numbers are, what is missing, or what is due next.";
}
