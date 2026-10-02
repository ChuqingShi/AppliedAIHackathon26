import { CLIENT } from "@/data/nav";
import type { Case, Inquiry } from "@/data/types";

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const moneyK = (n: number) => "$" + Math.round(n / 1000) + "k";
// "2026-10-02" as "Oct 2, 2026", or as "Oct 2" without the year. Anything that isn't a YYYY-MM-DD day is left as it is.
export const day = (iso: string, year = true) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: year ? "numeric" : undefined, timeZone: "UTC" })
    : iso;
export const billsTotal = (c: Case) => c.providers.reduce((sum, p) => sum + p.billed, 0);
// An ISO timestamp as "Oct 2, 3:14 PM", in the reader's own time zone.
export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
// Who the firm can send a question to: the client, and each medical provider on the case.
export const recipients = (c: Case) => [
  { id: CLIENT, name: c.client.name, what: "Client" },
  ...c.providers.map((p) => ({ id: p.id, name: p.name, what: "Medical provider" })),
];
// The questions still waiting on the firm: answered, and not yet closed.
export const newAnswers = (inquiries: Inquiry[]) => inquiries.filter((q) => q.reply && !q.closedAt);
// The ones still waiting on whoever they were sent to.
export const unanswered = (inquiries: Inquiry[]) => inquiries.filter((q) => !q.reply && !q.closedAt);
