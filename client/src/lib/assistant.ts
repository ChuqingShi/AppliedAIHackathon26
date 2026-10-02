// "Ask about this case", firm only. A question is answered by Claude from the
// case record and the pages of the case's documents that match it, so it can be
// about anything written in a PDF. Without credentials for the Claude API (set
// ANTHROPIC_API_KEY), or when it can't be reached, the answer falls back to
// keyword rules over the case record and then to the best-matching page.
// Replies are plain text with **bold** marks.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { billsTotal, money } from "@/components/format";
import type { Case, Passage, Reply } from "@/data/types";
import { findPages } from "./passages";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You are the assistant in the search box of a personal-injury law firm's case dashboard. Someone at the firm asks about one case. Answer from the case record and the document excerpts you are given, and from nothing else: the firm acts on these answers, so if neither holds the answer, say that plainly instead of guessing.

The reply appears in a small chat bubble that renders plain text and **bold** only. Write a few plain sentences, leading with the answer, with no headings, lists or other markdown, and put the figures, dates and names the reader is looking for in **bold**.

Each excerpt is one page of a document on the case, and is numbered. When something you say comes from an excerpt, put its number in square brackets right after it, like [2]; the dashboard turns those into links that open the document at that page. Facts from the case record need no citation. The excerpts were found by keyword search, so some of them will have nothing to do with the question: ignore those.`;

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

// The reply's citations renumbered 1, 2, … in the order it first makes them, with
// the pages they point to in that order. A number that isn't an excerpt's is dropped.
function cited(text: string, pages: Passage[]): Reply {
  const order: number[] = [];
  const renumbered = text.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, list: string) => {
    const ns = list.split(",").map(Number).filter((n) => pages[n - 1]);
    for (const n of ns) if (!order.includes(n)) order.push(n);
    return ns.length ? `[${ns.map((n) => order.indexOf(n) + 1).join(", ")}]` : "";
  });
  return { text: renumbered.trim(), sources: order.map((n) => pages[n - 1]) };
}

// Claude's answer, or null when it can't be had (no credentials, the API is down
// or it declined), which leaves the question to the rules below.
async function ask(c: Case, q: string, pages: (Passage & { text: string })[]): Promise<Reply | null> {
  const excerpts = pages.map((p, i) => `<excerpt number="${i + 1}" document="${p.name}" page="${p.page}">\n${p.text}\n</excerpt>`);
  try {
    const response = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // A short answer in a search box: don't deliberate over it.
      output_config: { effort: "low" },
      // If the model's safety classifiers decline a question, a fallback model answers it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM },
        // The record is the same from one question to the next, so it is cached.
        { type: "text", text: `The case record, as JSON:\n${JSON.stringify(c)}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{
        role: "user",
        content: `${excerpts.length ? excerpts.join("\n\n") : "No page of the case's documents matches this question."}\n\nQuestion: ${q}`,
      }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return text.trim() ? cited(text, pages.map(({ docId, name, page, snippet }) => ({ docId, name, page, snippet }))) : null;
  } catch (error) {
    console.warn(`Assistant: answering without Claude. ${error instanceof Anthropic.APIError ? `The API returned ${error.status}: ${error.message}` : error}`);
    return null;
  }
}

// Answers a question about the case, saying which document pages the answer is from.
export async function reply(c: Case, q: string): Promise<Reply> {
  const pages = await findPages(q, true);
  const asked = await ask(c, q, pages);
  if (asked) return asked;
  const known = answer(c, q);
  if (known) return { text: known, sources: [] };
  const sources = pages.slice(0, 4).map(({ docId, name, page, snippet }) => ({ docId, name, page, snippet }));
  if (sources.length) return { text: `The closest match is in **${sources[0].name}**, page ${sources[0].page}: “${sources[0].snippet}”`, sources };
  return { text: "I couldn't find that in the case record or its documents. I can answer what changed, what the numbers are, what is missing, what is due next, or what a document says.", sources: [] };
}

// Keyword answers over the case record, for when Claude can't be asked. Null when
// the question matches none of them.
function answer(c: Case, q: string) {
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
  return null;
}
