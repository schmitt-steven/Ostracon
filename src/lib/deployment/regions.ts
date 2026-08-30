/**
 * Region codes → city names. Covers Vercel's edge codes (`fra1`), AWS's
 * (`eu-central-1`) and Azure's (`gwc`) in one map — they don't collide, and a
 * miss just prints the code alone.
 */
const CITIES: Record<string, string> = {
  // Vercel's function regions.
  arn1: "Stockholm",
  bom1: "Mumbai",
  cdg1: "Paris",
  cle1: "Cleveland",
  cpt1: "Cape Town",
  dub1: "Dublin",
  fra1: "Frankfurt",
  gru1: "São Paulo",
  hkg1: "Hong Kong",
  hnd1: "Tokyo",
  iad1: "Washington, D.C.",
  icn1: "Seoul",
  kix1: "Osaka",
  lhr1: "London",
  pdx1: "Portland",
  sfo1: "San Francisco",
  sin1: "Singapore",
  syd1: "Sydney",
  // What `vercel dev` reports, which is nowhere.
  dev1: "Local",

  // AWS, where Neon puts most of its projects.
  "ap-northeast-1": "Tokyo",
  "ap-southeast-1": "Singapore",
  "ap-southeast-2": "Sydney",
  "eu-central-1": "Frankfurt",
  "eu-west-2": "London",
  "sa-east-1": "São Paulo",
  "us-east-1": "N. Virginia",
  "us-east-2": "Ohio",
  "us-west-2": "Oregon",

  // Azure, for the Neon projects that live there.
  eastus2: "Virginia",
  gwc: "Germany West Central",
  westus3: "Arizona",
};

/** A region as both halves — the code you paste somewhere, the city you read. */
export type Region = {
  /** Exactly as the platform spells it — `fra1`, `eu-central-1`, `gwc`. */
  code: string;
  /** Null for a code we have no city on file for, which prints the code alone. */
  city: string | null;
};

export function describeRegion(code: string): Region {
  return { code, city: CITIES[code] ?? null };
}
