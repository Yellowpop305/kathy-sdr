import { request } from "undici";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Account, Contact } from "../types.js";

/**
 * Vibe Prospecting / Explorium data client.
 *
 * NOTE on endpoints: the exact REST paths/payloads for Explorium's API may
 * differ from the shapes below — they mirror the MCP tool surface used to
 * design Kathy (fetch businesses, fetch prospects, enrich contacts). Adjust
 * `PATHS` and the request bodies to match the API key tier you're issued.
 * Everything else (filters, the ICP) is locked to the playbook.
 */

const PATHS = {
  fetchBusinesses: "/businesses/fetch",
  fetchProspects: "/prospects/fetch",
  enrichContacts: "/prospects/enrich/contacts",
};

// ---- ICP filters (from the playbook) ----------------------------------------

export const ICP = {
  company_country_code: { values: ["US"] },
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

/** Target titles per scenario (resolve to standardized titles via autocomplete in prod). */
export const SCENARIO_TITLES: Record<string, string[]> = {
  A: ["marketing", "brand", "creative", "store design", "visual merchandising"],
  B: ["store design", "procurement", "purchasing", "construction", "store development"],
  C: ["procurement", "purchasing", "category buyer", "construction", "vendor management"],
};

async function post<T>(p: string, body: unknown): Promise<T> {
  const res = await request(`${config.EXPLORIUM_BASE_URL}${p}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      // Explorium authenticates via the `api_key` header (not a Bearer token).
      api_key: config.EXPLORIUM_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`Explorium ${p} ${res.statusCode}: ${text}`);
  }
  return (await res.body.json()) as T;
}

interface RawBusiness {
  business_id: string;
  business_name: string;
  business_domain: string;
  business_city_name?: string;
  business_region?: string;
  business_naics_description?: string;
  business_business_description?: string;
  business_number_of_locations_range?: string;
}

interface RawProspect {
  prospect_id: string;
  business_id: string;
  full_name: string;
  first_name?: string;
  job_title?: string;
  email?: string;
  phone_number?: string;
  linkedin_url?: string;
}

/** Fetch qualifying accounts (50+ US locations in target verticals). */
export async function fetchAccounts(limit: number): Promise<Account[]> {
  if (config.DRY_RUN) return DRY_ACCOUNTS.slice(0, limit);
  const data = await post<{ data: RawBusiness[] }>(PATHS.fetchBusinesses, {
    filters: ICP,
    number_of_results: limit,
  });
  return (data.data ?? []).map((b) => ({
    businessId: b.business_id,
    name: b.business_name,
    domain: b.business_domain,
    city: b.business_city_name,
    region: b.business_region,
    vertical: b.business_naics_description,
    description: b.business_business_description,
    numLocationsBucket: b.business_number_of_locations_range,
  }));
}

/** Fetch + contact-enrich decision-makers for an account, given its scenario. */
export async function fetchContacts(
  account: Account,
  scenario: string,
  perAccount: number,
): Promise<Contact[]> {
  if (config.DRY_RUN) {
    return DRY_CONTACTS(account).slice(0, perAccount);
  }
  const fetched = await post<{ data: RawProspect[]; table_name?: string }>(
    PATHS.fetchProspects,
    {
      filters: {
        ...ICP,
        business_id: { values: [account.businessId] },
        job_title: { values: SCENARIO_TITLES[scenario] ?? SCENARIO_TITLES.A },
        has_email: true,
      },
      number_of_results: perAccount,
      max_per_company: perAccount,
    },
  );

  const enriched = await post<{ data: RawProspect[] }>(PATHS.enrichContacts, {
    table_name: fetched.table_name,
    contact_types: ["email", "phone"],
  });

  const rows = enriched.data?.length ? enriched.data : fetched.data;
  return (rows ?? []).map((p) => ({
    prospectId: p.prospect_id,
    businessId: account.businessId,
    fullName: p.full_name,
    firstName: p.first_name ?? p.full_name.split(" ")[0] ?? "there",
    title: p.job_title ?? "",
    email: p.email,
    phone: p.phone_number,
    linkedinUrl: p.linkedin_url,
  }));
}

// ---- DRY_RUN fixtures (let the loop run with no API key / credits) -----------

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
