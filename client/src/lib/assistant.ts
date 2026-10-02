// "Ask about this case", in the search box. A question is answered only from
// what the person asking may see: the record the server built for their role
// (src/lib/dashboard.ts). Nothing else is put in front of the assistant, so it
// has nothing else to give away.
//
// - The firm is answered from everything held on the case: the case record, the
//   facts the backend drew from its documents, the pages of those documents that
//   match the question, and the answers to the questions the firm has already
//   sent out. When the case doesn't hold the answer, the reply says so and comes
//   with a message to whoever would know (a medical provider or the client),
//   ready to send from the search box.
// - A medical provider is answered from their own record of the case: its stage,
//   their bill and the documents the firm holds from them (by name), what the
//   firm needs from them, the updates shared with them and the questions sent to
//   them. The patient is named, but their personal details are left out, and so
//   are the pages of the documents, which carry those details.
// - The client is answered from what the firm holds about them, their incident
//   and injuries, who is working on their case and the questions sent to them.
//   Never from the case's documents or anything read out of them.
//
// Claude does the answering. Without credentials for the Claude API (set
// ANTHROPIC_API_KEY), or when it can't be reached, keyword rules over the same
// material stand in. Replies are plain text with **bold** marks.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { billsTotal, day, money, recipients, unanswered } from "@/components/format";
import { DETAILS } from "@/data/details";
import { CLIENT } from "@/data/nav";
import type { Case, CaseFrame, ClientCase, Dashboard, Draft, Inquiry, Passage, ProviderCase, Reply } from "@/data/types";
import { caseFacts, findPages } from "./passages";
import type { Facts, Page, Treatment } from "./passages";

type Firm = Extract<Dashboard, { role: "firm" }>;
type Provider = Extract<Dashboard, { role: "provider" }>;
type Client = Extract<Dashboard, { role: "client" }>;

const MODEL = "claude-opus-5-5";
// A treating provider's last record older than this says nothing about how the client is now.
const STALE_DAYS = 90;

const SYSTEM = `You are the assistant in the search box of a personal-injury law firm's case dashboard. Someone at the firm asks about one case. You are given everything the dashboard holds on it: the case record, the facts read out of its documents, the questions the firm has already sent to people outside the firm with their replies, and the pages of the documents that match the question.

Answer from that material and from nothing else. The firm acts on these answers, so never guess. The case holds the answer only if the material actually says it; and when the question is about how things stand now (an update, the latest, current status), an old record is not an answer: say what the latest on file is and when it dates from, and that nothing newer is held. Set "answered" to false whenever the case doesn't hold what was asked.

"answer" appears in a small chat bubble that renders plain text and **bold** only. Write a few plain sentences, leading with the answer, with no headings, lists or other markdown, and put the figures, dates and names the reader is looking for in **bold**. Each excerpt is one page of a document on the case, and is numbered. When something you say comes from an excerpt, put its number in square brackets right after it, like [2]; the dashboard turns those into links that open the document at that page. Facts from the rest of the material need no citation. The excerpts were found by keyword search, so some will have nothing to do with the question: ignore those.

The firm can send a message through the dashboard to the client or to any medical provider on the case, and track the reply. Always fill "to" and "message" with the message that would get this question answered first-hand: when "answered" is false it is offered as the next step, otherwise it is kept one click away. "to" is the id of the recipient best placed to know: the provider treating the injury or giving the care in question (the one with the most recent records, if several fit), or the client for anything about themselves. "message" is sent as written, so write it complete, in the firm's voice, from the person asking: a short, courteous note that names the client, says exactly what is needed and as of when the firm's information stops, and can be answered in a few lines. It is read outside the firm, so put nothing in it from the firm's notes, strategy or figures, and nothing about other providers. If a question already sent covers this and is still unanswered, say so in "answer" (who was asked, when, and whether they have seen it) instead of suggesting it be asked again.`;

// How a reply is to be written, whoever it is for.
const BUBBLE = `"answer" appears in a small chat bubble that renders plain text and **bold** only. Write a few plain sentences, leading with the answer, with no headings, lists or other markdown, and put the figures, dates and names the reader is looking for in **bold**.`;

const PROVIDER_SYSTEM = `You are the assistant in the search box of a personal-injury law firm's case dashboard. The person asking works for a medical provider treating the firm's client, and is signed in to that provider's own view of one case. You are given everything that view holds: the stage the case has reached, the patient's name, the incident and the injuries, this provider's bill and lien balance, the documents the firm holds from them (by name), what the firm still needs from them, the updates the firm has shared with them, who is on the legal team, and the questions the firm has sent them with their replies.

Answer from that material and from nothing else, and never guess. You have deliberately not been given the patient's personal details (date of birth, age, phone, email, home address, occupation, identity documents), what any document says, other providers' records or bills, or the firm's notes, strategy, case value and settlement figures. When a question asks for any of those, or for anything else the material doesn't say, say plainly that it isn't available here and that the legal team is who to ask, without speculating about what it might be, and set "answered" to false.

${BUBBLE}`;

const CLIENT_SYSTEM = `You are the assistant in the search box of a personal-injury law firm's case dashboard. The person asking is the firm's client, the injured person the case is about, signed in to their own view of it. You are given everything that view holds: what the firm holds about them personally, their incident and injuries, the stage their case has reached, who at the firm is working on it, the medical providers treating them, and the questions the firm has sent them with their replies.

Answer from that material and from nothing else, and never guess. You have deliberately not been given the case's documents (court filings, medical records, bills, correspondence, expert reports) or anything read out of them, or the firm's notes, strategy, case value and settlement figures. When a question asks for any of those, or for anything else the material doesn't say, say plainly that it isn't available here and that their legal team can tell them, without speculating about what it might be, and set "answered" to false. You are not their lawyer: give no legal advice and don't predict how the case will go.

Write to them directly ("you", "your case"), in everyday words. ${BUBBLE}`;

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

// How far the case has got, as every role is told it.
function stage(c: CaseFrame) {
  const s = c.stages[c.stageIndex];
  return `**${s.name}** (stage ${c.stageIndex + 1} of ${c.stages.length}${s.date ? `, since ${s.date}` : ""})`;
}

// The questions from the firm still waiting on this provider or client.
function waiting(inquiries: Inquiry[]) {
  const n = unanswered(inquiries).length;
  return n ? `**${n} question${n > 1 ? "s" : ""}** from your legal team ${n > 1 ? "are" : "is"} waiting for your answer, under **Questions for you**.` : "";
}

// The same for a medical provider: where the case is and what the firm is waiting on from them.
export function briefingForProvider(c: ProviderCase, inquiries: Inquiry[]) {
  const [need] = c.requests;
  const [latest] = c.updates;
  return [
    `The case is in ${stage(c)}.`,
    need ? `Needed from you: **${need.title}**, due ${need.due}.` : "",
    waiting(inquiries),
    latest ? `Latest update: **${latest.t}** (${latest.date}).` : "",
  ].filter(Boolean).join(" ");
}

// And for the client: where their case is and whether the firm has asked them anything.
export function briefingForClient(c: ClientCase, inquiries: Inquiry[]) {
  return [`Your case is in ${stage(c)}.`, waiting(inquiries), "Ask about your case, your details or who is working on it."].filter(Boolean).join(" ");
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

// One answer from Claude, as an object with the given properties, or null when
// it can't be had (no credentials, the API is down or it declined), which leaves
// the question to the rules below. `record` is what the asker's role may see and
// `turn` what changes from one question to the next; Claude is sent nothing else.
async function claude<T extends { answer: string }>(system: string, record: string, turn: string, properties: Record<string, object>): Promise<T | null> {
  try {
    const response = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        // A short answer in a search box: don't deliberate over it.
        effort: "low",
        format: {
          type: "json_schema",
          schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
        },
      },
      // If the model's safety classifiers decline a question, a fallback model answers it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: system },
        // The record is the same from one question to the next, so it is cached.
        { type: "text", text: record, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: turn }],
    });
    if (response.stop_reason !== "end_turn") return null;
    const out: T = JSON.parse(response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
    return out.answer.trim() ? out : null;
  } catch (error) {
    console.warn(`Assistant: answering without Claude. ${error instanceof Anthropic.APIError ? `The API returned ${error.status}: ${error.message}` : error}`);
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

// Claude's answer for the firm, from the whole case.
async function ask(d: Firm, q: string, pages: Page[], facts: Facts): Promise<Reply | null> {
  const to = recipients(d.case);
  const excerpts = pages.map((p, i) => `<excerpt number="${i + 1}" document="${p.name}" page="${p.page}">\n${p.text}\n</excerpt>`);
  const out = await claude<{ answer: string; answered: boolean; to: string; message: string }>(
    SYSTEM,
    [
      `The case record, as JSON:\n${JSON.stringify(d.case)}`,
      `Facts read out of the case's documents (latest status per treating provider and the experts' conclusions, the documents by date, the bills), as JSON:\n${JSON.stringify(facts)}`,
      `Who a message can be sent to, as JSON:\n${JSON.stringify(to)}`,
    ].join("\n\n"),
    [
      `Today is ${today()}. The person asking is ${d.user.name} (${d.user.title}) at ${d.case.firm}.`,
      `Questions the firm has already sent, with any replies, as JSON:\n${JSON.stringify(d.inquiries)}`,
      excerpts.length ? excerpts.join("\n\n") : "No page of the case's documents matches this question.",
      `Question: ${q}`,
    ].join("\n\n"),
    { answer: { type: "string" }, answered: { type: "boolean" }, to: { type: "string", enum: to.map((r) => r.id) }, message: { type: "string" } },
  );
  if (!out) return null;
  const draft = to.some((r) => r.id === out.to) && out.message.trim() ? { to: out.to, message: out.message.trim() } : undefined;
  return { ...cited(out.answer, pages), draft, missing: !out.answered && Boolean(draft) };
}

// What a medical provider is answered from: their own record of the case, field
// by field. Of the patient, only the name and how long they have been this
// provider's patient: the rest of what the firm holds about them personally
// (date of birth, age, contact details, occupation) is not the assistant's to
// give out, so it is never handed to it.
function providerRecord(d: Provider) {
  const c = d.case;
  return {
    caseId: c.id, lawFirm: c.firm, you: c.provider.name,
    stages: c.stages, currentStage: c.stages[c.stageIndex].name,
    patient: { name: c.patient.name, yourPatientSince: c.patient.since },
    incident: c.incident, injuries: c.injuries,
    yourLienBalance: c.lien, yourBill: c.billLines,
    yourDocumentsOnFile: c.documents,
    filesYouSentTheFirm: d.uploads.map((u) => ({ fileName: u.fileName, note: u.note, uploadedAt: u.uploadedAt, openedByTheFirmAt: u.openedAt })),
    neededFromYou: c.requests,
    updatesSharedWithYou: c.updates,
    legalTeam: c.team,
  };
}

// What the client is answered from: their own record of the case. It holds no
// document and nothing read out of one.
function clientRecord(d: Client) {
  const c = d.case;
  return {
    caseId: c.id, caseTitle: c.title, lawFirm: c.firm,
    stages: c.stages, currentStage: c.stages[c.stageIndex].name,
    yourDetails: c.client, incident: c.incident, injuries: c.injuries,
    legalTeam: c.team, yourMedicalProviders: c.providers,
  };
}

// Claude's answer for a medical provider or the client, from their own record.
async function askOutside(d: Provider | Client, q: string): Promise<Reply | null> {
  const [system, record, who] = d.role === "provider"
    ? [PROVIDER_SYSTEM, providerRecord(d), `${d.user.name}, for ${d.case.provider.name}`]
    : [CLIENT_SYSTEM, clientRecord(d), `${d.user.name}, the client`];
  const asked = d.inquiries.map((i) => ({ from: i.from, message: i.message, sentAt: i.sentAt, reply: i.reply, repliedAt: i.repliedAt, closed: Boolean(i.closedAt) }));
  const out = await claude<{ answer: string; answered: boolean }>(
    system,
    `What this person's view of the case holds, as JSON:\n${JSON.stringify(record)}`,
    [
      `Today is ${today()}. The person asking is ${who}.`,
      `Questions the firm has sent them, with any replies, as JSON:\n${JSON.stringify(asked)}`,
      `Question: ${q}`,
    ].join("\n\n"),
    { answer: { type: "string" }, answered: { type: "boolean" } },
  );
  return out && { text: out.answer.trim(), sources: [], missing: !out.answered };
}

// Answers a question about the case from what the asker's role may see. For the
// firm, the reply says which document pages it is from and, when the case doesn't
// hold the answer, who to ask and what to send them. A provider and the client
// are told when their record doesn't say (`missing`), so they can ask the legal team.
export async function reply(d: Dashboard, q: string): Promise<Reply> {
  if (d.role !== "firm") return (await askOutside(d, q)) ?? (d.role === "provider" ? providerRule(d, q) : clientRule(d, q));
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

// ---- The same for a medical provider and for the client, over their own record ----

// What the dashboard doesn't tell the person asking: the reply says so, and that the legal team would know.
const notHere = (what: string): Reply => ({ text: `${what} Your legal team would know: you can message them from the sidebar.`, sources: [], missing: true });

const LEGAL_TEAM = /\b(legal team|law firm|lawyers?|attorneys?|paralegals?|main contact|my contact|who (is|are) (working|handling)|who (do|can|should) i)\b/;
// The firm's own side of the case, which neither a provider nor the client is given.
const FIRM_ONLY = /\b(worth|case value|valu\w+|offers?|demand|policy( limits?)?|insur\w*|adjuster|strategy|notes?|fees?|costs?|settlement (amount|offer|figure|number|value)|how much (is|was|will) (the|my) (case|settlement))\b/;
// What the firm holds about the client personally.
const PERSONAL = /\b(phone|telephone|cell|mobile|e-?mail|address|lives?|birth\w*|dob|born|age|how old|occupation|job|employer|employed|languages?|ssn|social security|contact (details|info\w*)|personal (details|info\w*)|photo|licen[cs]e|identity)\b/;
const QUESTIONS = /\b(questions?|asked|asking)\b/;
const INJURIES = /\b(injur\w*|hurt|diagnos\w*|condition)\b/;
const INCIDENT = /\b(incident|accident|collision|crash|happened)\b/;
const STATUS = /\b(status|stages?|progress|going|settle\w*|trial|where|how far|how long|when|next|stand\w*)\b/;

const team = (c: { team: { name: string; role: string; main?: boolean }[]; firm: string }) =>
  c.team.length
    ? `Your legal team at **${c.firm}**: ${c.team.map((m) => `**${m.name}** (${m.role}${m.main ? ", your main contact" : ""})`).join(", ")}.`
    : `Your case is with **${c.firm}**.`;

// The questions the firm has sent this provider or client, and where each stands.
function questions(inquiries: Inquiry[]) {
  if (!inquiries.length) return "Your legal team hasn't sent you any questions.";
  const open = unanswered(inquiries);
  const first = open[0];
  return open.length
    ? `${waiting(inquiries)} The ${open.length > 1 ? "latest" : "question"} is from **${first.from}** on ${day(first.sentAt.slice(0, 10))}: “${first.message}”`
    : `You have answered every question your legal team sent you (${inquiries.length} so far). They are under **Questions for you**.`;
}

const injuries = (c: { injuries: ProviderCase["injuries"] }) =>
  `Injuries on the case: ${c.injuries.map((j) => `**${j.name}**${j.status ? ` (${j.status.replace(/\.$/, "")})` : ""}`).join("; ") || "none recorded"}.`;

function providerRule(d: Provider, q: string): Reply {
  const c = d.case;
  const t = q.toLowerCase();
  const said = (text: string): Reply => ({ text, sources: [] });

  if (LEGAL_TEAM.test(t)) return said(team(c));
  // Asked of the firm's assistant, the patient's personal details stay with the firm.
  if (PERSONAL.test(t)) return notHere("The patient's personal details aren't available through this assistant.");
  if (FIRM_ONLY.test(t) || /\bother (providers?|doctors?)\b/.test(t)) return notHere("The firm's own figures and notes, and other providers' files, aren't shared here.");

  if (/\b(need\w*|requests?|requested|outstanding|missing|waiting|overdue|due|owe you|to send|still)\b/.test(t)) {
    if (!c.requests.length) return said(["The firm isn't waiting on anything from you right now.", waiting(d.inquiries)].filter(Boolean).join(" "));
    return said(`The firm needs ${c.requests.map((r) => `**${r.title}**, due ${r.due} (${r.daysLeft >= 0 ? `${r.daysLeft} days left` : `${-r.daysLeft} days overdue`})`).join("; ")}. ${c.requests[0].detail} You can upload it under **Records & bills**.`);
  }
  if (QUESTIONS.test(t)) return said(questions(d.inquiries));
  if (/\b(bill\w*|liens?|paid|pay\w*|balance|charges?|amounts?|invoices?|ledger|money|how much)\b/.test(t)) {
    return said(`Your lien balance on this case is **${money(c.lien)}**${c.billLines.length ? ` (${c.billLines.map((l) => `${l.name}: ${money(l.amount)}`).join("; ")})` : ""}. Providers are paid at the final step, once there is a settlement.`);
  }
  if (/\b(records?|documents?|files?|charts?|upload\w*|received|on file|sent)\b/.test(t)) {
    return said([
      c.documents.length ? `On file from you: ${c.documents.map((x) => `**${x.name}** (${x.date.toLowerCase()})`).join("; ")}.` : "The firm has nothing on file from you yet.",
      d.uploads.length ? `You have sent the firm ${d.uploads.length} file${d.uploads.length > 1 ? "s" : ""} here, most recently **${d.uploads[0].fileName}**${d.uploads[0].openedAt ? ", which they have opened" : ""}.` : "",
    ].filter(Boolean).join(" "));
  }
  if (/\b(updates?|latest|new|changed|recent\w*|correspondence|this week)\b/.test(t)) {
    return said(c.updates.length ? `Latest shared with you: ${c.updates.slice(0, 3).map((u) => `**${u.t}** (${u.date})`).join("; ")}.` : "No updates have been shared with you yet.");
  }
  if (INJURIES.test(t)) return said(injuries(c));
  if (INCIDENT.test(t) || /\bpatient\b/.test(t)) {
    return said(`**${c.patient.name}**${c.patient.since ? `, your patient since ${c.patient.since},` : ""} was in a ${c.incident.type.toLowerCase()} on **${c.incident.date}**. ${c.incident.summary} ${injuries(c)}`);
  }
  if (STATUS.test(t)) return said(`The case is in ${stage(c)}. You will be notified here as soon as there is a settlement.`);
  return notHere("What is shared with you on this case doesn't say.");
}

function clientRule(d: Client, q: string): Reply {
  const c = d.case;
  const t = q.toLowerCase();
  const said = (text: string): Reply => ({ text, sources: [] });

  if (LEGAL_TEAM.test(t)) return said(team(c));
  // Their own details are theirs to see (and to correct).
  if (PERSONAL.test(t) || /\b(details|information|info|name)\b/.test(t)) {
    const held = DETAILS.flatMap((f) => (c.client[f.key] ? [`${f.label.toLowerCase()} **${f.key === "dob" ? day(c.client.dob) : c.client[f.key]}**`] : []));
    return said(`On file for you: ${held.join(", ") || "nothing yet"}. You can correct any of it under **My information**.`);
  }
  // The case file stays inside the firm.
  if (FIRM_ONLY.test(t) || /\b(documents?|records?|files?|filings?|pleadings?|complaint|summons|subpoena|discovery|depositions?|experts?|reports?|bills?|billed|liens?|letters?|correspondence|money)\b/.test(t)) {
    return notHere("The case's documents and the firm's own figures and notes aren't shared here.");
  }
  if (QUESTIONS.test(t)) return said(questions(d.inquiries));
  if (/\b(providers?|doctors?|treat\w*|clinics?|hospitals?|therap\w*)\b/.test(t)) {
    return said(c.providers.length ? `Treating you on this case: ${c.providers.map((p) => `**${p.name}**${p.since ? ` (since ${p.since})` : ""}`).join("; ")}.` : "No medical providers are recorded on your case yet.");
  }
  if (INJURIES.test(t)) return said(injuries(c));
  if (INCIDENT.test(t)) return said(`Your case is about a ${c.incident.type.toLowerCase()} on **${c.incident.date}**${c.incident.location ? ` at ${c.incident.location}` : ""}. ${c.incident.summary}`);
  if (STATUS.test(t)) {
    const next = c.stages[c.stageIndex + 1];
    return said(`Your case is in ${stage(c)}.${next ? ` The next stage is **${next.name}**.` : ""} ${waiting(d.inquiries)}`.trim());
  }
  return notHere("What is shared with you on your case doesn't say.");
}
