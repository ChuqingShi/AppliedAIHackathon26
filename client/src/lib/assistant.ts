// "Ask about this case", firm only. Replies are plain text with **bold** marks,
// the same shape a model's reply will have.

import "server-only";
import { billsTotal, money } from "@/components/format";
import type { Case } from "@/data/types";

// A short catch-up built from the latest updates and the next open task.
export function briefing(c: Case) {
  const latest = c.updates.slice(0, 2).map((u) => `**${u.firm.t}** (${u.date})`);
  const next = c.tasks[0];
  const parts = [
    latest.length ? `Latest: ${latest.join("; ")}.` : "",
    next ? `Next due: **${next.title}**, ${next.due}.` : "",
  ].filter(Boolean);
  return parts.join(" ") || "Nothing has been recorded on this case yet.";
}

// Keyword answers over the case record, so the box is clickable in the demo.
// Replace with a call to the backend (which calls the model with the case
// record) when this is built.
export function answer(c: Case, q: string) {
  const f = c.financials;
  const t = q.toLowerCase();
  const urgent = c.tasks.filter((x) => x.urgent);

  if (/miss|outstanding|waiting|still need/.test(t)) {
    const waiting = c.providers.filter((p) => p.bill === "warn" || p.records === "warn");
    if (!waiting.length && !urgent.length) return "Nothing is outstanding right now.";
    return [
      waiting.length ? `Waiting on **${waiting.map((p) => p.name).join(", ")}**.` : "",
      urgent.length ? `${urgent.length} to-do${urgent.length > 1 ? "s are" : " is"} due within a week or overdue, starting with **${urgent[0].title}** (${urgent[0].due}).` : "",
    ].filter(Boolean).join(" ");
  }

  if (/due|next|task|to-?do|deadline/.test(t)) {
    const next = c.tasks.slice(0, 2).map((x) => `**${x.title}** (${x.due})`);
    const d = c.deadline;
    return [
      next.length ? `Next up: ${next.join(", then ")}.` : "No open to-dos.",
      d ? `${d.label}: ${d.date}${d.met ? " (satisfied)" : `, ${d.daysLeft} days away`}.` : "",
    ].filter(Boolean).join(" ");
  }

  if (/apart|gap|offer|demand|target|settle|money|financ|worth|number|value/.test(t)) {
    const parts = [
      f.offer != null ? `Their offer is **${money(f.offer)}**.` : "No offer is recorded in Clio.",
      f.demand != null ? `Our demand is **${money(f.demand)}**.` : "",
      f.targetLow != null && f.targetHigh != null ? `Our target range is ${money(f.targetLow)} – ${money(f.targetHigh)}.` : "",
      f.estimatedValue != null ? `Estimated case value is **${money(f.estimatedValue)}**.` : "",
      f.policyLimit != null ? `The policy limit is **${money(f.policyLimit)}**.` : "",
      `Medical bills total **${money(billsTotal(c))}**.`,
      f.note ?? "",
    ];
    return parts.filter(Boolean).join(" ");
  }

  if (/client|phone|call|contact|injur/.test(t)) {
    const cl = c.client;
    return [
      `**${cl.name}**${cl.age != null ? `, ${cl.age}` : ""}.`,
      cl.phone ? `Phone ${cl.phone}.` : "",
      `Injuries: ${c.injuries.map((j) => j.name).join("; ") || "none recorded"}.`,
    ].filter(Boolean).join(" ");
  }

  if (/provider|bill|lien|medical|record/.test(t)) {
    return `Medical bills total **${money(billsTotal(c))}** across ${c.providers.length} providers.${f.liens != null ? ` Lien asserted against the recovery: ${money(f.liens)}.` : ""}`;
  }

  if (/chang|new|week|update|happen|summary|catch|recent/.test(t)) return briefing(c);
  return "I can answer what changed, what the numbers are, what is missing, or what is due next.";
}
