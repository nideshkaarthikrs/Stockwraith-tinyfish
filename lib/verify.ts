import type { Listing, SpecInput, Verdict, VerifiedListing } from "./schema";
import { toInr } from "./fx";

const ORDER: Record<Verdict, number> = { green: 0, amber: 1, red: 2 };
const worse = (a: Verdict, b: Verdict): Verdict => (ORDER[a] >= ORDER[b] ? a : b);

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

// "LQFP-48", "48-LQFP", "LQFP 48 7x7x1.4 mm" → "LQFP48"
export function pkgKey(s: string): string {
  const fam = s.toUpperCase().match(/[A-Z]{2,}/)?.[0] ?? "";
  const pins = s.match(/\d+/)?.[0] ?? "";
  return fam + pins;
}

// "-40 to +85 °C", "-40°C ~ 85°C" → [-40, 85]. Celsius only, exactly two values; anything else is null.
const NON_CELSIUS = /[°º]\s*[FK]\b|℉|\bdeg(?:rees?)?\s*[FK]\b|fahrenheit|kelvin|\d\s*[FK]\b/i;

export function tempPair(s: string): [number, number] | null {
  if (NON_CELSIUS.test(s)) return null;
  const n = s.replace(/[–—−]/g, "-").match(/[-+]?\d+(?:\.\d+)?/g);
  return n && n.length === 2 ? [Number(n[0]), Number(n[1])] : null;
}

export function unitPriceInr(l: Listing, qty: number): number | null {
  if (!l.price_breaks?.length) return null;
  const sorted = [...l.price_breaks].sort((a, b) => a.qty - b.qty);
  const pb = [...sorted].reverse().find((p) => p.qty <= qty) ?? sorted[0];
  if (pb.qty > qty) return null;
  return toInr(pb.unit_price, pb.currency);
}

interface RuleResult {
  verdict: Verdict;
  reasons: string[];
}

// Plain-code checks. Deterministic, run on every listing.
export function ruleCheck(l: Listing, spec: SpecInput, ref: Listing | null): RuleResult {
  let verdict: Verdict = "green";
  const found: { v: Verdict; r: string }[] = [];
  const flag = (v: Verdict, r: string) => {
    verdict = worse(verdict, v);
    found.push({ v, r });
  };

  if (!l.mpn) flag("amber", "part number not confirmed on page");
  else if (norm(l.mpn) !== norm(spec.mpn)) flag("red", `different part: ${l.mpn}`);

  if (!l.package) flag("amber", "package not stated");
  else if (pkgKey(l.package) !== pkgKey(spec.package)) flag("red", `package ${l.package} ≠ ${spec.package}`);

  const want = tempPair(spec.temp_range);
  const got = l.temp_range ? tempPair(l.temp_range) : null;
  if (!l.temp_range) flag("amber", "temperature range not stated");
  else if (!got) flag("amber", `temperature range unclear: ${l.temp_range}`);
  else if (want && (got[0] !== want[0] || got[1] !== want[1]))
    flag("red", `page claims ${l.temp_range}, required ${spec.temp_range}`);

  if (ref?.extra_claims && l.extra_claims && ref !== l && norm(ref.extra_claims) !== norm(l.extra_claims))
    flag("red", `page claims ${l.extra_claims}, manufacturer says ${ref.extra_claims}`);

  if (l.stock === null) flag("amber", "stock not shown");
  else if (l.stock === 0) flag("amber", "out of stock");
  else if (l.stock < spec.qty) flag("amber", `only ${l.stock.toLocaleString()} in stock, need ${spec.qty}`);

  const minBreak = l.price_breaks?.length ? Math.min(...l.price_breaks.map((p) => p.qty)) : null;
  if (l.moq && l.moq > spec.qty) flag("amber", `MOQ ${l.moq} exceeds required quantity ${spec.qty}`);
  if (l.moq && minBreak !== null && l.moq > minBreak)
    flag("amber", `MOQ ${l.moq} but a qty-${minBreak} price is listed (mixed packaging?)`);

  if (l.lifecycle && !/^active$/i.test(l.lifecycle.trim())) flag("amber", `lifecycle: ${l.lifecycle}`);

  // Most severe finding first, so it becomes the one-line reason when the LLM is unavailable.
  const reasons = found.sort((a, b) => ORDER[b.v] - ORDER[a.v]).map((f) => f.r);
  return { verdict, reasons };
}

const MODELS = [process.env.GEMINI_MODEL ?? "gemini-3.8-flash", "gemini-3.5-flash-lite"];

interface LlmVerdict {
  seller: string;
  verdict: Verdict;
  reason: string;
}

// One Gemini call reviews every listing at once. It may only escalate rule verdicts, never relax them.
async function llmReview(
  listings: Listing[],
  spec: SpecInput,
  ref: Listing | null,
  rules: RuleResult[],
): Promise<LlmVerdict[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = `You verify electronic component listings against a buyer's required spec.
Required: ${JSON.stringify(spec)}
Manufacturer reference (authoritative): ${JSON.stringify(ref)}
Listings with code-rule findings:
${JSON.stringify(listings.map((l, i) => ({ ...l, rule_verdict: rules[i].verdict, rule_findings: rules[i].reasons })))}
For each listing return verdict green (exact match, safe to buy), amber (needs a human check) or red (mismatch / conflicting claims),
and ONE short plain-English reason (max 14 words). Never pick a verdict better than rule_verdict. Do not invent facts not present above.`;

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    seller: { type: "STRING" },
                    verdict: { type: "STRING", enum: ["green", "amber", "red"] },
                    reason: { type: "STRING" },
                  },
                  required: ["seller", "verdict", "reason"],
                },
              },
            },
          }),
        },
      );
      if (!res.ok) {
        console.warn(`[verify] ${model} ${res.status}`, (await res.text()).slice(0, 200));
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) continue;
      return parsed.filter((v): v is LlmVerdict => !!v && typeof v.seller === "string" &&
        ["green", "amber", "red"].includes(v.verdict) && typeof v.reason === "string");
    } catch (e) {
      console.warn(`[verify] ${model} failed`, e);
    }
  }
  return null;
}

export interface VerifyOutput {
  rows: VerifiedListing[];
  verifier: string;
}

export async function verifyAll(
  items: { listing: Listing; source: "live" | "cached" }[],
  spec: SpecInput,
  ref: Listing | null,
  offline = false,
): Promise<VerifyOutput> {
  const listings = items.map((i) => i.listing);
  const rules = listings.map((l) => ruleCheck(l, spec, ref));
  const llm = offline ? null : await llmReview(listings, spec, ref, rules);

  const rows: VerifiedListing[] = items.map(({ listing, source }, i) => {
    const r = rules[i];
    const ai = llm?.find((v) => v.seller === listing.seller);
    const verdict = ai ? worse(r.verdict, ai.verdict) : r.verdict;
    const reason = (ai && ORDER[ai.verdict] >= ORDER[r.verdict] ? ai.reason : null) || r.reasons[0] || "matches required spec";
    return { ...listing, source, verdict, reason, unit_price_inr: unitPriceInr(listing, spec.qty), rank: 0 };
  });

  rows.sort((a, b) => {
    if (ORDER[a.verdict] !== ORDER[b.verdict]) return ORDER[a.verdict] - ORDER[b.verdict];
    const aOk = (a.stock ?? 0) >= spec.qty ? 0 : 1;
    const bOk = (b.stock ?? 0) >= spec.qty ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    return (a.unit_price_inr ?? Infinity) - (b.unit_price_inr ?? Infinity);
  });
  rows.forEach((r, i) => (r.rank = i + 1));

  return { rows, verifier: llm ? "Gemini + rules" : "rules only (LLM unavailable)" };
}
