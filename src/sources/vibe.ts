import { request } from "undici";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Account, Contact } from "../types.js";

/**
 * Explorium (Vibe Prospecting) data client — matched to the documented
 * AgentSource REST API (https://developers.explorium.ai).
 *
 *   - Fetch businesses:  POST /v1/businesses
 *   - Fetch prospects:   POST /v1/prospects
 *   - Enrich contacts:   POST /v1/prospects/contacts_information/enrich  (per prospect_id)
 *
 * Auth header is `api_key`. EXPLORIUM_BASE_URL defaults to https://api.explorium.ai/v1.
 */

const PATHS = {
  businesses: "/businesses",
  prospects: "/prospects",
  enrichContacts: "/prospects/contacts_information/enrich",
};

// ---- ICP business filters (from the playbook) -------------------------------
// NOTE: the businesses endpoint uses `country_code` (lowercase alpha-2) for HQ.

export const ICP_BUSINESS_FILTERS = {
  country_code: { values: ["us", "ca"] },
  number_of_locations: { values: ["51-100", "101-1000", "1001+"] },
  linkedin_category: {
    values: [
      "restaurants",
      "retail",
      "retail apparel and fashion",
      "retail groceries",
      "retail footwear",
      "retail sporting goods",
      "health, wellness & fitness",
      "wellness and fitness services",
      "personal care services",
      "cosmetics",
      "hospitality",
      "hotels and motels",
    ],
  },
} as const;

// The roles relevant to Yellowpop (not C-suite). `expand_job_titles` also
// pulls in semantically-related titles, so this list stays high-coverage
// without dragging in Presidents/CEOs.
const TARGET_TITLES = [
  "Brand Manager",
  "VP of Brand",
  "VP of Marketing",
  "Marketing Manager",
  "Customer Experience Manager",
  "Retail Experience Manager",
  "Store Designer",
  "Retail Designer",
  "Visual Merchandising Manager",
  "Procurement Manager",
  "Construction Manager",
];

// Prospects must be physically located in the US or Canada.
const PROSPECT_COUNTRIES = ["US", "CA"];

async function post<T>(p: string, body: unknown): Promise<T> {
  const res = await request(`${config.EXPLORIUM_BASE_URL}${p}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      api_key: config.EXPLORIUM_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`Explorium ${p} ${res.statusCode}: ${text.slice(0, 300)}`);
  }
  return (await res.body.json()) as T;
}

interface RawBusiness {
  business_id: string;
  name?: string;
  business_name?: string;
  domain?: string;
  business_domain?: string;
  website?: string;
  city_name?: string;
  business_city_name?: string;
  region?: string;
  business_region?: string;
  naics_description?: string;
  business_naics_description?: string;
  business_description?: string;
  business_business_description?: string;
}

interface RawProspect {
  prospect_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  job_title?: string;
  title?: string;
  company_name?: string;
  linkedin?: string;
}

interface EnrichData {
  professions_email?: string;
  emails?: Array<Record<string, string>>;
  mobile_phone?: string;
  phone_numbers?: Array<Record<string, string>>;
}

const pick = <T>(...vals: (T | undefined)[]): T | undefined =>
  vals.find((v) => v !== undefined && v !== null && v !== "");

/** Fetch qualifying accounts: 50+ US locations in target verticals. */
export async function fetchAccounts(limit: number): Promise<Account[]> {
  if (config.DRY_RUN) return DRY_ACCOUNTS.slice(0, limit);
  const data = await post<{ data: RawBusiness[] }>(PATHS.businesses, {
    mode: "full",
    size: limit,
    page_size: Math.min(limit, 100),
    page: 1,
    filters: ICP_BUSINESS_FILTERS,
    request_context: {},
  });
  return (data.data ?? []).map((b) => ({
    businessId: b.business_id,
    name: pick(b.name, b.business_name) ?? "(unknown)",
    domain: pick(b.domain, b.business_domain, b.website) ?? "",
    city: pick(b.city_name, b.business_city_name),
    region: pick(b.region, b.business_region),
    vertical: pick(b.naics_description, b.business_naics_description),
    description: pick(b.business_description, b.business_business_description),
  }));
}

/** Fetch decision-makers for an account and enrich each with email + phone. */
export async function fetchContacts(
  account: Account,
  _scenario: string,
  perAccount: number,
): Promise<Contact[]> {
  if (config.DRY_RUN) return DRY_CONTACTS(account).slice(0, perAccount);

  // Target the roles relevant to Yellowpop, located in the US/Canada, with an
  // email on file. Title-based (not seniority) so we skip Presidents/CEOs.
  const filters = {
    business_id: { values: [account.businessId] },
    has_email: { value: true },
    country_code: { values: PROSPECT_COUNTRIES }, // prospect's own location
    job_title: { values: TARGET_TITLES, expand_job_titles: true },
  };

  let prospects: RawProspect[] = [];
  try {
    const res = await post<{ data: RawProspect[] }>(PATHS.prospects, {
      mode: "full",
      size: perAccount,
      page_size: perAccount,
      page: 1,
      filters,
      request_context: {},
    });
    prospects = res.data ?? [];
  } catch (err) {
    log.warn("prospects.fetchFailed", { company: account.name, error: String(err) });
  }

  const contacts: Contact[] = [];
  for (const p of prospects.slice(0, perAccount)) {
    const c: Contact = {
      prospectId: p.prospect_id,
      businessId: account.businessId,
      fullName: pick(p.full_name, [p.first_name, p.last_name].filter(Boolean).join(" ")) ?? "there",
      firstName: pick(p.first_name, p.full_name?.split(" ")[0]) ?? "there",
      title: pick(p.job_title, p.title) ?? "",
      linkedinUrl: p.linkedin,
    };
    try {
      const enriched = await post<{ data: EnrichData | EnrichData[] }>(PATHS.enrichContacts, {
        prospect_id: p.prospect_id,
        parameters: { contact_types: ["email", "phone"] },
      });
      const d = Array.isArray(enriched.data) ? enriched.data[0] : enriched.data;
      if (d) {
        c.email = pick(d.professions_email, firstValue(d.emails));
        c.phone = pick(d.mobile_phone, firstValue(d.phone_numbers));
      }
    } catch (err) {
      log.warn("enrich.failed", { prospectId: p.prospect_id, error: String(err) });
    }
    contacts.push(c);
  }
  return contacts;
}

function firstValue(arr?: Array<Record<string, string>>): string | undefined {
  if (!arr?.length) return undefined;
  const first = arr[0];
  if (!first) return undefined;
  const vals = Object.values(first);
  return vals.length ? vals[0] : undefined;
}

// ---- DRY_RUN fixtures (run the loop with no API key / credits) --------------

const DRY_ACCOUNTS: Account[] = [
  {
    businessId: "dry-001",
    name: "Sweetgreen",
    domain: "sweetgreen.com",
    city: "Los Angeles",
    region: "California",
    vertical: "Restaurants",
    description:
      "Fast-casual restaurant chain serving salads and healthy bowls across 200+ US locations.",
    numLocationsBucket: "101-1000",
  },
  {
    businessId: "dry-002",
    name: "Drybar",
    domain: "thedrybar.com",
    city: "Irvine",
    region: "California",
    vertical: "Personal care services",
    description: "Blowout-only hair salon chain with 100+ US locations.",
    numLocationsBucket: "101-1000",
  },
];

function DRY_CONTACTS(account: Account): Contact[] {
  return [
    {
      prospectId: `${account.businessId}-p1`,
      businessId: account.businessId,
      fullName: "Jordan Avery",
      firstName: "Jordan",
      title: "VP, Brand & Creative",
      email: `jordan@${account.domain}`,
      phone: "+1-310-555-0142",
      linkedinUrl: "https://linkedin.com/in/example-jordan",
    },
  ];
}

log.debug("vibe client loaded", { dryRun: config.DRY_RUN ?? false });
