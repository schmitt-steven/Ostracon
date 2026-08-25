/**
 * Region codes, in the words a person would use for them.
 *
 * Three different systems name the places this app runs in — Vercel's edge
 * codes (`fra1`), AWS's (`eu-central-1`), Azure's (`gwc`) — and none of them
 * is a place name. "fra1" tells you nothing unless you already know; "fra1 ·
 * Frankfurt" tells you the note you just saved travelled to Germany and back.
 * That is the whole reason the deployment section prints a region at all, so
 * the code alone would be printing the question rather than the answer.
 *
 * One map for all three because the caller shouldn't have to know which naming
 * system a string came from — the codes don't collide, and a lookup that
 * misses simply prints the code on its own, which is what would have been
 * shown anyway.
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

/**
 * A region, kept as both halves rather than flattened into one string.
 *
 * The code is the thing you paste into a dashboard or a support thread and the
 * city is the thing you understand, and neither substitutes for the other — so
 * the pair travels together and the section prints both, the code set in the
 * monospaced face so it reads as the identifier it is.
 */
export type Region = {
  /** Exactly as the platform spells it — `fra1`, `eu-central-1`, `gwc`. */
  code: string;
  /** Null for a code we have no city on file for, which prints the code alone. */
  city: string | null;
};

export function describeRegion(code: string): Region {
  return { code, city: CITIES[code] ?? null };
}
