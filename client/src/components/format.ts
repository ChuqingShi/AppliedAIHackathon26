import type { Case } from "@/data/types";

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const moneyK = (n: number) => "$" + Math.round(n / 1000) + "k";
// "2026-10-02" as "Oct 2, 2026", or as "Oct 2" without the year. Anything that isn't a YYYY-MM-DD day is left as it is.
export const day = (iso: string, year = true) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: year ? "numeric" : undefined, timeZone: "UTC" })
    : iso;
export const billsTotal = (c: Case) => c.providers.reduce((sum, p) => sum + p.billed, 0);
