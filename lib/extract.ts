import type { Listing, PriceBreak, SellerType } from "./schema";

// Deterministic extraction from Fetch markdown. Only reads the main product block;
// anything not found stays null.
export function extractFromMarkdown(
  md: string,
  opts: { seller: string; seller_type: SellerType; mpn: string; url: string; title?: string | null },
): Listing {
  // Cut "related products" style tails so we don't pick up other items' stock/prices.
  const main = md.split(/###\s*(NEW Products|Have You Seen|Related Products|Frequently Asked Questions)/i)[0];

  const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : null);

  let stock: number | null = num(main.match(/Stock:\s*([\d,]+)/i)?.[1]);
  if (stock === null && /Out of Stock/i.test(main)) stock = 0;

  const price_breaks: PriceBreak[] = [];
  const exGst = main.match(/Rs\.?\s*([\d,]+(?:\.\d+)?)\s*\+\s*GST/i);
  if (exGst) price_breaks.push({ qty: 1, unit_price: num(exGst[1])!, currency: "INR" });

  let moq: number | null = num(main.match(/MOQ[:\s]+([\d,]+)/i)?.[1]);
  if (moq === null && /No MOQ/i.test(main)) moq = 1;

  const pkg =
    main.match(/Package Name\s*\|\s*([^|\n]+)/i)?.[1]?.trim() ??
    main.match(/Package(?:\/Case)?:\s*([^\n*]+)/i)?.[1]?.trim() ??
    null;

  let temp_range: string | null = null;
  const tMin = main.match(/Operating Temp Min Celsius\s*\|\s*(-?[\d.]+)/i)?.[1];
  const tMax = main.match(/Operating Temp Max Celsius\s*\|\s*(-?[\d.]+)/i)?.[1];
  if (tMin && tMax) temp_range = `${Number(tMin)} to +${Number(tMax)} °C`;
  else temp_range = main.match(/Temperature Range:\s*([^\n*]+)/i)?.[1]?.trim() ?? null;

  const lifecycle = main.match(/^\s*(Active|NRND|Obsolete|EOL|Not Recommended[^\n]*)\s*$/im)?.[1] ?? null;

  const flash = (opts.title ?? "") + "\n" + main;
  const flashClaim = flash.match(/(\d+)\s*Kbytes? (?:of )?Flash/i)?.[1];

  const mpnOnPage = main.toUpperCase().includes(opts.mpn.toUpperCase()) ? opts.mpn.toUpperCase() : null;

  return {
    seller: opts.seller,
    seller_type: opts.seller_type,
    mpn: mpnOnPage,
    stock,
    moq,
    price_breaks,
    lead_time: stock && stock > 0 ? "In stock" : null,
    package: pkg,
    temp_range,
    lifecycle,
    url: opts.url,
    read_at: new Date().toISOString(),
    extra_claims: flashClaim ? `${flashClaim} KB Flash` : null,
  };
}
