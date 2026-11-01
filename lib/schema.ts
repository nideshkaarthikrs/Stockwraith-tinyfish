export type SellerType = "authorised" | "broker" | "manufacturer_store";

export interface PriceBreak {
  qty: number;
  unit_price: number;
  currency: string;
}

// One listing as read from a seller page. Unknown fields are null, never guessed.
export interface Listing {
  seller: string;
  seller_type: SellerType;
  mpn: string | null;
  stock: number | null;
  moq: number | null;
  price_breaks: PriceBreak[];
  lead_time: string | null;
  package: string | null;
  temp_range: string | null;
  lifecycle: string | null;
  url: string;
  read_at: string;
  extra_claims?: string | null; // other spec claims on the page (e.g. flash size)
}

export type Verdict = "green" | "amber" | "red";

export interface VerifiedListing extends Listing {
  source: "live" | "cached";
  verdict: Verdict;
  reason: string;
  unit_price_inr: number | null;
  rank: number;
}

export interface SpecInput {
  mpn: string;
  package: string;
  temp_range: string;
  qty: number;
}

// JSON schema handed to TinyFish agent runs as output_schema.
export const LISTING_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    mpn: { type: "string", nullable: true },
    stock: { type: "number", nullable: true },
    moq: { type: "number", nullable: true },
    price_breaks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qty: { type: "number" },
          unit_price: { type: "number" },
          currency: { type: "string" },
        },
        required: ["qty", "unit_price", "currency"],
      },
    },
    lead_time: { type: "string", nullable: true },
    package: { type: "string", nullable: true },
    temp_range: { type: "string", nullable: true },
    lifecycle: { type: "string", nullable: true },
    url: { type: "string", nullable: true },
  },
  required: ["mpn", "stock", "price_breaks", "package", "temp_range", "url"],
} as const;
