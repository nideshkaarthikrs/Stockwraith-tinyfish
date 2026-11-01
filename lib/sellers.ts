import type { SellerType } from "./schema";

export interface SellerConfig {
  id: string;
  name: string;
  type: SellerType;
  mode: "agent" | "fetch";
  timeoutMs: number;
  isReference?: boolean;
  // Returns the page to open, or null when the page must be discovered via TinyFish Search.
  url: (mpn: string) => string | null;
  searchDomain?: string;
}

// Seller pages we already verified for the demo part.
const KNOWN_PAGES: Record<string, Record<string, string>> = {
  dna: { STM32F103C8T6: "https://www.dnatechindia.com/stm-32f103c8t6-arm-microcontrollers-mcu.html" },
};

export const SELLERS: SellerConfig[] = [
  {
    id: "lcsc",
    name: "LCSC",
    type: "authorised",
    mode: "agent",
    timeoutMs: 4 * 60_000,
    url: (mpn) => `https://www.lcsc.com/search?q=${encodeURIComponent(mpn)}`,
  },
  {
    id: "digikey",
    name: "DigiKey India",
    type: "authorised",
    mode: "agent",
    timeoutMs: 5 * 60_000,
    url: (mpn) => `https://www.digikey.in/en/products/result?keywords=${encodeURIComponent(mpn)}`,
  },
  {
    id: "dna",
    name: "DNA Techindia",
    type: "broker",
    mode: "fetch",
    timeoutMs: 45_000,
    url: (mpn) => KNOWN_PAGES.dna[mpn.toUpperCase()] ?? null,
    searchDomain: "dnatechindia.com",
  },
  {
    id: "st",
    name: "ST eStore",
    type: "manufacturer_store",
    mode: "fetch",
    timeoutMs: 45_000,
    isReference: true,
    url: (mpn) => `https://estore.st.com/en/${mpn.toLowerCase()}-cpn.html`,
  },
];

export function agentGoal(mpn: string): string {
  return [
    `Search this site for the exact electronic part number "${mpn}".`,
    `Open the product detail page for exactly ${mpn} (not a different suffix or variant).`,
    `From that page read: manufacturer part number, quantity in stock, minimum order quantity,`,
    `every price break (quantity, unit price, currency), lead time, package/case,`,
    `operating temperature range, and lifecycle/part status. Also return the product page URL.`,
    `Use null for any field not shown on the page. Never guess or estimate values.`,
    `Do not log in, create an account or add anything to the cart.`,
  ].join(" ");
}
