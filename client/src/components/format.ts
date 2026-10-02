import type { Case } from "@/data/types";

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const moneyK = (n: number) => "$" + Math.round(n / 1000) + "k";
export const billsTotal = (c: Case) => c.providers.reduce((sum, p) => sum + p.billed, 0);
