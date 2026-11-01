// Plain digits, or commas grouped the Western (2,500) or Indian (1,00,000) way. Nothing else.
const FORMATS = [/^\d+$/, /^\d{1,3}(,\d{3})+$/, /^\d{1,2}(,\d{2})*,\d{3}$/];

export function parseQty(text: string): number | null {
  const s = text.trim();
  if (!FORMATS.some((f) => f.test(s))) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
