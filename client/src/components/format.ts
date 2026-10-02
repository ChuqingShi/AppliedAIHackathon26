export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const moneyK = (n: number) => "$" + Math.round(n / 1000) + "k";
