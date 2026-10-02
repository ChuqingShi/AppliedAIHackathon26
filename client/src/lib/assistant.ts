// "Ask about this case", firm only. Replies are plain text with **bold** marks,
// the same shape a model's reply will have.

import "server-only";
import { billsTotal, money } from "@/components/format";
import type { Case } from "@/data/types";

export function briefing(c: Case) {
  const f = c.financials;
  return `Since Monday: the insurer made a first offer of **${money(f.offer)}** against our **${money(f.demand)}** demand and is questioning the shoulder surgery. Summit Orthopedics owes a narrative report by Oct 8. **Counteroffer is due ${f.counterDue}.**`;
}

// Canned answers so the box is clickable in the demo. Replace with a call to
// the backend (which calls the model with the case record) when this is built.
export function answer(c: Case, q: string) {
  const f = c.financials;
  const t = q.toLowerCase();
  if (/miss|outstanding|waiting|still need/.test(t)) return "Two things are outstanding: the **final bill from Harbor Pain Management** (Priya is chasing it, due Mon, Oct 5) and the **narrative report from Summit Orthopedics** (due Thu, Oct 8).";
  if (/due|next|task|to-?do|deadline/.test(t)) return `Next up: **call the client** about the offer (Mon, Oct 5), then **send the counteroffer** (${f.counterDue}). The filing deadline is ${c.deadline.date}, ${c.deadline.daysLeft} days away.`;
  if (/apart|gap|offer|demand|target|settle|money|financ|worth/.test(t)) return `Their offer is **${money(f.offer)}**; our demand is **${money(f.demand)}**. Our target range is ${money(f.targetLow)} – ${money(f.targetHigh)}, so the gap to the low end is **${money(f.targetLow - f.offer)}**. The planned counter is ${money(f.counter)}.`;
  if (/client|maria|phone|call|contact|injur/.test(t)) return `**${c.client.name}**, ${c.client.age}. Best reached at ${c.client.phone}, ${c.client.bestTime.toLowerCase()}. Injuries: rotator cuff tear (surgery May 12), neck strain, lower back strain.`;
  if (/provider|bill|lien|medical|record/.test(t)) return `Medical bills total **${money(billsTotal(c))}** across ${c.providers.length} providers. Records are in from all of them; one final bill (Harbor Pain Management) is still pending.`;
  if (/chang|new|week|update|happen|summary|catch/.test(t)) return briefing(c);
  return "This prototype only has sample answers. Try asking what changed, how far apart the numbers are, what is missing, or what is due next.";
}
