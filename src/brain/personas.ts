/**
 * Yellowpop's four target ICPs. Defined once here so Kathy's behavior (search,
 * relevance scoring, message angle, sheet tagging) and the written playbook
 * stay in sync. Tune these as you learn what converts.
 */

export type IcpCategory =
  | "Brand"
  | "Retail / Store Design"
  | "Construction"
  | "Procurement";

export interface Icp {
  category: IcpCategory;
  /** Who they are. */
  roles: string;
  /** What they care about. */
  cares: string;
  /** Why Yellowpop matters to them — the angle Kathy leads with. */
  angle: string;
  /** Seed titles for the search (expanded semantically by the API). */
  titleSeed: string[];
}

export const ICPS: Icp[] = [
  {
    category: "Brand",
    roles:
      "Marketing, brand, creative, growth, field/retail marketing, and customer/retail experience leaders (manager → VP).",
    cares:
      "Brand consistency, in-store atmosphere, customer experience, differentiation, and social/UGC-worthy moments across locations.",
    angle:
      "On-brand, photogenic LED neon that elevates the in-store experience, drives organic social tagging and foot traffic, and keeps brand identity consistent across every location.",
    titleSeed: [
      "Brand Manager",
      "Marketing Manager",
      "Director of Brand",
      "VP of Marketing",
      "Creative Director",
      "Customer Experience Manager",
      "Retail Experience Manager",
    ],
  },
  {
    category: "Retail / Store Design",
    roles:
      "Store designers, retail designers, visual merchandising, store design/planning, and store development design leads.",
    cares:
      "Look and feel of the space, design execution, fixtures, flexibility, and consistent quality rolled out across many stores.",
    angle:
      "Custom LED neon as a versatile, durable design element — easy to spec into any store concept, consistent across the fleet, and far lighter and safer to work with than traditional glass neon.",
    titleSeed: [
      "Store Designer",
      "Retail Designer",
      "Visual Merchandising Manager",
      "Store Design Manager",
      "Store Development Manager",
    ],
  },
  {
    category: "Construction",
    roles:
      "Construction managers, store build-out / development, and store-facing facilities leads.",
    cares:
      "Installation, safety, durability, low maintenance, electrical simplicity, and hitting build timelines reliably across many sites.",
    angle:
      "LED neon is low-voltage and safe (no glass, no gas), durable, and simple to install and maintain across many build-outs — with reliable lead times that fit construction schedules.",
    titleSeed: [
      "Construction Manager",
      "Store Construction Manager",
      "Facilities Manager",
      "Director of Construction",
    ],
  },
  {
    category: "Procurement",
    roles:
      "Procurement, purchasing, sourcing, and category buyers (especially fixtures / store goods / signage).",
    cares:
      "Cost, vendor reliability, consistency, lead times, terms, and the ability to scale a rollout without quality drift.",
    angle:
      "A reliable, consistent supply partner: cost-effective versus glass neon, dedicated account management, predictable lead times, and quality that holds up across a full multi-location rollout.",
    titleSeed: [
      "Procurement Manager",
      "Purchasing Manager",
      "Category Manager",
      "Sourcing Manager",
      "Director of Procurement",
    ],
  },
];

/** Flat seed list for the prospect search (API expands semantically). */
export const PERSONA_TITLE_SEED = ICPS.flatMap((i) => i.titleSeed);

/** Persona definition used by the LLM relevance judge. */
export const PERSONA_DEFINITION = `Yellowpop sells custom LED neon signage to multi-location brands.
Reach people who INFLUENCE OR DECIDE on in-store signage, store design/build-outs, brand environment,
or who SOURCE/BUY such products. Classify each relevant person into exactly ONE of four ICPs:

1. "Brand" — ${ICPS[0]!.roles}
2. "Retail / Store Design" — ${ICPS[1]!.roles}
3. "Construction" — ${ICPS[2]!.roles}
4. "Procurement" — ${ICPS[3]!.roles}

Prefer manager → director level; senior managers and directors are ideal.

NOT relevant (exclude): CEO, President, Founder, Owner, any C-suite/chief officer,
finance/accounting, HR/people/recruiting, IT/engineering/software/data, legal,
direct sales/account executives, customer-support reps, supply-chain for unrelated goods,
and anyone whose role has no connection to store environment, signage, design, procurement, or construction.`;

/** Look up an ICP's messaging angle by category. */
export function icpAngle(category?: string): string {
  return ICPS.find((i) => i.category === category)?.angle ?? "";
}
