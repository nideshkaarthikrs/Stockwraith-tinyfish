// Fixed conversion rates to INR, shown in the UI. Override with FX_USD_INR in .env.local.
export const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: Number(process.env.FX_USD_INR ?? 88),
};

export const FX_NOTE = `USD→INR at ${FX_TO_INR.USD} (fixed rate). Prices ex-GST.`;

export function toInr(amount: number, currency: string): number | null {
  const c = currency.toUpperCase().replace("₹", "INR").replace("RS", "INR").replace("$", "USD");
  const rate = FX_TO_INR[c];
  return rate ? Math.round(amount * rate * 100) / 100 : null;
}
