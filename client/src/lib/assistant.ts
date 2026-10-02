// "Ask about this case", firm only. A question is answered from everything held
// on the case: the case record, the facts the backend drew from its documents,
// the pages of those documents that match the question, and the answers to the
// questions the firm has already sent out. When the case doesn't hold the
// answer, the reply says so and comes with a message to whoever would know (a
// medical provider or the client), ready to send from the search box.
//
// Claude does the answering. Without credentials for the Claude API (set
// ANTHROPIC_API_KEY), or when it can't be reached, keyword rules over the same
// material stand in. Replies are plain text with **bold** marks.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { billsTotal, day, money, recipients } from "@/components/format";
import { CLIENT } from "@/data/nav";
import type { Case, Dashboard, Draft, Passage, Reply } from "@/data/types";
import { caseFacts, findPages } from "./passages";
import type { Facts, Page, Treatment } from "./passages";

type Firm = Extract<Dashboard, { role: "firm" }>;

const MODEL = "claude-opus-5-5";
// A treating provider's last record older than this says nothing about how the client is now.
const STALE_DAYS = 90;

const SYSTEM = `You are the assistant in the search box of a personal-injury law firm's case dashboard. Someone at the firm asks about one case. You are given everything the dashboard holds on it: the case record, the facts read out of its documents, the questions the firm has already sent to people outside the firm with their replies, and the pages of the documents that match the question.

Answer from that material and from nothing else. The firm acts on these answers, so never guess. The case holds the answer only if the material actually says it; and when the question is about how things stand now (an update, the latest, current status), an old record is not an answer: say what the latest on file is and when it dates from, and that nothing newer is held. Set "answered" to false whenever the case doesn't hold what was asked.

"answer" appears in a small chat bubble that renders plain text and **bold** only. Write a few plain sentences, leading with the answer, with no headings, lists or other markdown, and put the figures, dates and names the reader is looking for in **bold**. Each excerpt is one page of a document on the case, and is numbered. When something you say comes from an excerpt, put its number in square brackets right after it, like [2]; the dashboard turns those into links that open the document at that page. Facts from the rest of the material need no citation. The excerpts were found by keyword search, so some will have nothing to do with the question: ignore those.

The firm can send a message through the dashboard to the client or to any medical provider on the case, and track the reply. Always fill "to" and "message" with the message that would get this question answered first-hand: when "answered" is false it is offered as the next step, otherwise it is kept one click away. "to" is the id of the recipient best placed to know: the provider treating the injury or giving the care in question (the one with the most recent records, if several fit), or the client for anything about themselves. "message" is sent as written, so write it complete, in the firm's voice, from the person asking: a short, courteous note that names the client, says exactly what is needed and as of when the firm's information stops, and can be answered in a few lines. It is read outside the firm, so put nothing in it from the firm's notes, strategy or figures, and nothing about other providers. If a question already sent covers this and is still unanswered, say so in "answer" (who was asked, when, and whether they have seen it) instead of suggesting it be asked again.`;

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

const source = ({ docId, name, page, snippet }: Passage): Passage => ({ docId, name, page, snippet });

// The reply's citations renumbered 1, 2, … in the order it first makes them, with
// the pages they point to in that order. A number that isn't an excerpt's is dropped.
function cited(text: string, pages: Passage[]): Pick<Reply, "text" | "sources"> {
  const order: number[] = [];
  const renumbered = text.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, list: string) => {
    const ns = list.split(",").map(Number).filter((n) => pages[n - 1]);
    for (const n of ns) if (!order.includes(n)) order.push(n);
    return ns.length ? `[${ns.map((n) => order.indexOf(n) + 1).join(", ")}]` : "";
  });
  return { text: renumbered.trim(), sources: order.map((n) => source(pages[n - 1])) };
}

// Claude's answer, or null when it can't be had (no credentials, the API is down
// or it declined), which leaves the question to the rules below.
async function ask(d: Firm, q: string, pages: Page[], facts: Facts): Promise<Reply | null> {
  const to = recipients(d.case);
  const excerpts = pages.map((p, i) => `<excerpt number="${i + 1}" document="${p.name}" page="${p.page}">\n${p.text}\n</excerpt>`);
  try {
    const response = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        // A short answer in a search box: don't deliberate over it.
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              answered: { type: "boolean" },
              to: { type: "string", enum: to.map((r) => r.id) },
              message: { type: "string" },
            },
            required: ["answer", "answered", "to", "message"],
            additionalProperties: false,
          },
        },
      },
      // If the model's safety classifiers decline a question, a fallback model answers it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM },
        // The case is the same from one question to the next, so it is cached.
        {
          type: "text",
          text: [
            `The case record, as JSON:\n${JSON.stringify(d.case)}`,
            `Facts read out of the case's documents (latest status per treating provider and the experts' conclusions, the documents by date, the bills), as JSON:\n${JSON.stringify(facts)}`,
            `Who a message can be sent to, as JSON:\n${JSON.stringify(to)}`,
          ].join("\n\n"),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: [
          `Today is ${new Date().toISOString().slice(0, 10)}. The person asking is ${d.user.name} (${d.user.title}) at ${d.case.firm}.`,
          `Questions the firm has already sent, with any replies, as JSON:\n${JSON.stringify(d.inquiries)}`,
          excerpts.length ? excerpts.join("\n\n") : "No page of the case's documents matches this question.",
          `Question: ${q}`,
        ].join("\n\n"),
      }],
    });
    if (response.stop_reason !== "end_turn") return null;
    const out: { answer: string; answered: boolean; to: string; message: string } = JSON.parse(
      response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""),
    );
    if (!out.answer.trim()) return null;
    const draft = to.some((r) => r.id === out.to) && out.message.trim() ? { to: out.to, message: out.message.trim() } : undefined;
    return { ...cited(out.answer, pages), draft, missing: !out.answered && Boolean(draft) };
  } catch (error) {
    console.warn(`Assistant: answering without Claude. ${error instanceof Anthropic.APIError ? `The API returned ${error.status}: ${error.message}` : error}`);
    return null;
  }
}

// Answers a question about the case, saying which document pages the answer is
// from and, when the case doesn't hold it, who to ask and what to send them.
export async function reply(d: Firm, q: string): Promise<Reply> {
  const [pages, facts] = await Promise.all([findPages(q, true), caseFacts()]);
  return (await ask(d, q, pages, facts)) ?? byRule(d, q, pages, facts);
}

// ---- Without Claude: keyword rules over the same material ----

// What a provider would know: the client's care, and the provider's own records and bills.
const MEDICAL = /injur|recover|treat|heal|prognos|condition|symptom|pain|therap|surg|medical|doctor|diagnos|rehab|visit|appointment|record|chart|bill|ledger|lien|mri|x-?ray|imaging|exam/;
// Words that say nothing about what a question is after.
const FILLER = new Set("a an and any are about can could did do does for from has have how is it its of on or our tell the their there this to was were what whats when where which who why will with you".split(" "));

const words = (text: string) => new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !FILLER.has(w)));

// Whether two questions ask for the same thing: most of their words in common.
function alike(a: string, b: string) {
  const [x, y] = [words(a), words(b)];
  const both = [...x].filter((w) => y.has(w)).length;
  return both > 0 && both / (x.size + y.size - both) >= 0.6;
}

// The provider on the case whose records these are. The name on a provider's
// letterhead and the one in Clio differ a little, so they are matched on their words.
function providerOf(c: Case, t: Treatment) {
  const name = words(t.provider);
  const shared = (p: { name: string }) => [...words(p.name)].filter((w) => name.has(w)).length;
  const best = c.providers.reduce<Case["providers"][number] | null>((most, p) => (shared(p) > (most ? shared(most) : 0) ? p : most), null);
  return best;
}

const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);

// The message that asks for what a question was after: to the provider it names,
// to the one with the latest records if it is about the client's care, and
// otherwise to the client themselves.
function draftFor(d: Firm, q: string, facts: Facts): Draft | undefined {
  const c = d.case;
  const t = q.toLowerCase();
  const asked = words(q);
  const treating = facts.recovery?.providers.flatMap((r) => providerOf(c, r) ?? []) ?? [];
  // A word of a provider's name that no other provider shares ("mcculloch", "chiropractic") names that provider.
  const named = c.providers.find((p) => [...words(p.name)].some((w) => w.length > 3 && asked.has(w) && c.providers.filter((o) => words(o.name).has(w)).length === 1));
  const provider = named ?? (MEDICAL.test(t) ? treating[0] ?? c.providers[0] ?? null : null);
  const sign = `Thank you,\n${d.user.name}, ${c.firm}`;
  if (!provider) {
    const first = c.client.name.split(" ")[0];
    return { to: CLIENT, message: `Hello ${first},\n\nWe need the following for your case and don't have it on file:\n\n“${q}”\n\nCould you reply here with what you know? A few lines is enough.\n\n${sign}` };
  }
  return { to: provider.id, message: `Hello,\n\nWe represent ${c.client.name} (case ${c.id}) and need the following, which we don't have on file:\n\n“${q}”\n\nCould you reply here with what you have, or let us know when you expect to? A few lines is enough.\n\n${sign}` };
}

function byRule(d: Firm, q: string, pages: Page[], facts: Facts): Reply {
  const c = d.case;
  const t = q.toLowerCase();
  const draft = draftFor(d, q, facts);

  // Already asked: the answer that came back, or that it is still out.
  const sent = d.inquiries.find((i) => i.asked && alike(i.asked, q));
  if (sent?.reply) {
    return { text: `**${sent.repliedBy ?? sent.to.name}** answered this on ${day(sent.repliedAt!.slice(0, 10))}: “${sent.reply}”`, sources: [], draft };
  }
  if (sent && !sent.closedAt) {
    return { text: `You asked **${sent.to.name}** this on ${day(sent.sentAt.slice(0, 10))}. ${sent.seenAt ? "They have seen it but not answered yet." : "They haven't seen it yet."} It is under **Questions sent**.`, sources: [] };
  }

  // How the client is doing: where each treating provider's records leave off.
  const latest = facts.recovery?.providers[0];
  if (MEDICAL.test(t) && /updat|latest|recent|current|now|status|progress|doing|new\b|how is|how's/.test(t) && latest) {
    const doc = c.documents.find((x) => x.id === latest.doc_id);
    const stale = daysSince(latest.last_visit) > STALE_DAYS;
    const provider = providerOf(c, latest);
    const text = [
      `The latest treatment record on file is from **${latest.provider}**, last visit **${day(latest.last_visit)}**: **${latest.label}**${latest.evidence ? ` (“${latest.evidence}”)` : ""}.`,
      c.injuries.length ? `Injuries on the case: ${c.injuries.map((j) => j.name).join("; ")}.` : "",
      stale ? `Nothing newer is on file, so an update since then would have to come from ${provider ? "them" : "the treating provider"}.` : "",
    ].filter(Boolean).join(" ");
    const sources = doc ? [{ docId: latest.doc_id, name: doc.name, page: latest.page, snippet: latest.evidence ?? "" }] : [];
    if (!stale || !provider) return { text, sources, draft };
    const message = `Hello,\n\nWe represent ${c.client.name} (case ${c.id}). The latest record we hold from your office is the visit of ${day(latest.last_visit)}.\n\nCould you send us an update on ${c.client.name.split(" ")[0]}'s condition and treatment since then: how the injuries are now, any new findings, and what is planned next? A short reply here is enough, and we can request the full records separately.\n\nThank you,\n${d.user.name}, ${c.firm}`;
    return { text, sources, draft: { to: provider.id, message }, missing: true };
  }

  const known = answer(c, q);
  if (known) return { text: known, sources: [], draft };
  // A page with every word of the question on it is taken as the answer. One with
  // only some of them is shown as the nearest thing, and the question goes out.
  const sources = pages.slice(0, 4).map(source);
  if (pages[0]?.complete) return { text: `From **${sources[0].name}**, page ${sources[0].page}: “${sources[0].snippet}”`, sources, draft };
  const who = draft && recipients(c).find((r) => r.id === draft.to);
  return {
    text: [
      "The case record and its documents don't say.",
      sources.length ? `The nearest page is **${sources[0].name}**, page ${sources[0].page}.` : "",
      who ? `**${who.name}** would be the one to ask: a message to them is ready below.` : "",
    ].filter(Boolean).join(" "),
    sources: sources.slice(0, 1), draft, missing: Boolean(draft),
  };
}

// Keyword answers over the case record. Null when the question matches none of them.
function answer(c: Case, q: string) {
  const f = c.financials;
  const t = q.toLowerCase();
  const urgent = c.tasks.filter((x) => x.urgent);

  if (/\b(missing|outstanding|waiting on|still need)/.test(t)) {
    const waiting = c.providers.filter((p) => p.bill === "warn" || p.records === "warn");
    if (!waiting.length && !urgent.length) return "Nothing is outstanding right now.";
    return [
      waiting.length ? `Waiting on **${waiting.map((p) => p.name).join(", ")}**.` : "",
      urgent.length ? `${urgent.length} to-do${urgent.length > 1 ? "s are" : " is"} due within a week or overdue, starting with **${urgent[0].title}** (${urgent[0].due}).` : "",
    ].filter(Boolean).join(" ");
  }

  if (/\b(due|next up|what'?s next|tasks?|to-?dos?|deadlines?|statute)\b/.test(t)) {
    const next = c.tasks.slice(0, 2).map((x) => `**${x.title}** (${x.due})`);
    const d = c.deadline;
    return [
      next.length ? `Next up: ${next.join(", then ")}.` : "No open to-dos.",
      d ? `${d.label}: ${d.date}${d.met ? " (satisfied)" : `, ${d.daysLeft} days away`}.` : "",
    ].filter(Boolean).join(" ");
  }

  if (/\b(apart|gap|offers?|demand|target|settle\w*|worth|financ\w*|case value|policy limit)\b/.test(t)) {
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

  if (/\b(phone|e-?mail|address|contact|reach)\b/.test(t)) {
    const cl = c.client;
    const held = [cl.phone && `phone **${cl.phone}**`, cl.email && `email **${cl.email}**`, cl.address && `address **${cl.address}**`].filter(Boolean);
    return held.length
      ? `On file for **${cl.name}**: ${held.join(", ")}.${cl.updated ? ` They last updated their details on ${day(cl.updated)}.` : ""}`
      : null;
  }

  if (/\binjur/.test(t)) {
    return `Injuries on the case: ${c.injuries.map((j) => `**${j.name}**${j.status ? ` (${j.status.replace(/\.$/, "")})` : ""}`).join("; ") || "none recorded"}.`;
  }

  if (/\b(bills?|billed|liens?|specials|medical expenses)\b/.test(t)) {
    return `Medical bills total **${money(billsTotal(c))}** across ${c.providers.length} providers.${f.liens != null ? ` Lien asserted against the recovery: ${money(f.liens)}.` : ""}`;
  }

  if (/\b(changed|what'?s new|this week|happened|summary|catch (me )?up|recent\w*|latest|updates?)\b/.test(t)) return briefing(c);
  return null;
}
