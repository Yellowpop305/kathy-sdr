import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Account, Contact, Draft, Scenario } from "../types.js";
import { SCENARIO_LABELS } from "../types.js";

/**
 * Google Sheet tracker — two tabs:
 *   - "Leads"     : one row per person Kathy works (the outreach tracker).
 *   - "Companies" : one row per qualified account (locations, tier, scenario).
 *
 * Auth reuses the same Google OAuth client as Gmail; the refresh token must be
 * minted with the spreadsheets scope. Missing tabs are created automatically.
 */

const LEADS_HEADER = [
  "Date Added",
  "Full Name",
  "Title",
  "Company",
  "ICP",
  "Email",
  "LinkedIn URL",
  "Phone",
  "Scenario",
  "Signage Reason",
  "Email Status",
  "LinkedIn Status",
  "Call Status",
  "Email Subject",
  "LinkedIn Note",
  "LinkedIn Follow-up",
];

const COMPANIES_HEADER = [
  "Date Added",
  "Company",
  "Domain",
  "Vertical",
  "# Locations",
  "Tier",
  "Revenue",
  "Employees",
  "Scenario",
  "Signage Reason",
  "City",
  "Region",
  "Country",
  "Leads Found",
];

const ensuredTabs = new Set<string>();

function client(): sheets_v4.Sheets {
  const oauth2 = new google.auth.OAuth2(config.GMAIL_CLIENT_ID, config.GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN });
  return google.sheets({ version: "v4", auth: oauth2 });
}

/** Make sure a tab exists (create if missing) and has its header row. */
async function ensureTab(
  sheets: sheets_v4.Sheets,
  tab: string,
  header: string[],
): Promise<void> {
  if (ensuredTabs.has(tab)) return;
  const spreadsheetId = config.SHEETS_SPREADSHEET_ID;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title);
  if (!titles.includes(tab)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
    log.info("sheets.tabCreated", { tab });
  }

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!1:1` });
  if (((res.data.values?.[0]?.length ?? 0) as number) === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [header] },
    });
    log.info("sheets.headerWritten", { tab });
  }
  ensuredTabs.add(tab);
}

async function appendRow(tab: string, header: string[], row: (string | number)[]): Promise<void> {
  const sheets = client();
  await ensureTab(sheets, tab, header);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SHEETS_SPREADSHEET_ID,
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

// ---- Leads tab --------------------------------------------------------------

export interface LeadRowInput {
  account: Account;
  contact: Contact;
  scenario: Scenario;
  emailDraft?: Draft;
  linkedinDraft?: Draft;
  emailStatus: string; // "Drafted" | "Sent"
}

function splitLinkedIn(draft?: Draft): { note: string; followUp: string } {
  if (!draft) return { note: "", followUp: "" };
  const [note, followUp] = draft.body.split("\n---\n");
  return { note: (note ?? draft.body).trim(), followUp: (followUp ?? "").trim() };
}

export async function appendLead(input: LeadRowInput): Promise<void> {
  if (!config.SHEETS_SPREADSHEET_ID) {
    log.warn("sheets.skip", { reason: "SHEETS_SPREADSHEET_ID not set" });
    return;
  }
  const { account, contact, scenario, emailDraft, linkedinDraft, emailStatus } = input;
  const li = splitLinkedIn(linkedinDraft);

  const row = [
    new Date().toISOString().slice(0, 10),
    contact.fullName,
    contact.title,
    account.name,
    contact.icp ?? "",
    contact.email ?? "",
    contact.linkedinUrl ?? "",
    contact.phone ?? "",
    `${scenario} — ${SCENARIO_LABELS[scenario]}`,
    account.scenarioReason ?? "",
    contact.email ? emailStatus : "No email",
    "Queued",
    contact.phone ? "To call" : "No phone",
    emailDraft?.subject ?? "",
    li.note,
    li.followUp,
  ];

  if (config.DRY_RUN) {
    log.info("sheets.dryRun", { tab: config.SHEETS_TAB, name: contact.fullName });
    return;
  }
  await appendRow(config.SHEETS_TAB, LEADS_HEADER, row);
  log.info("sheets.appended", { tab: config.SHEETS_TAB, name: contact.fullName });
}

// ---- Companies tab ----------------------------------------------------------

export interface CompanyRowInput {
  account: Account;
  scenario: Scenario;
  scenarioReason?: string;
  leads: number;
}

function tierFor(n?: number): string {
  if (n == null) return "Unknown";
  if (n >= 1000) return "Tier 1 (1000+)";
  if (n >= 250) return "Tier 2 (250–999)";
  if (n >= 100) return "Tier 3 (100–249)";
  return "Tier 4 (50–99)";
}

export async function appendCompany(input: CompanyRowInput): Promise<void> {
  if (!config.SHEETS_SPREADSHEET_ID) return;
  const { account, scenario, scenarioReason, leads } = input;

  const row = [
    new Date().toISOString().slice(0, 10),
    account.name,
    account.domain,
    account.vertical ?? "",
    account.numLocations ?? "",
    tierFor(account.numLocations),
    account.revenueRange ?? "",
    account.employeeRange ?? "",
    `${scenario} — ${SCENARIO_LABELS[scenario]}`,
    scenarioReason ?? "",
    account.city ?? "",
    account.region ?? "",
    account.country ?? "",
    leads,
  ];

  if (config.DRY_RUN) {
    log.info("sheets.dryRun", { tab: config.SHEETS_COMPANIES_TAB, company: account.name });
    return;
  }
  await appendRow(config.SHEETS_COMPANIES_TAB, COMPANIES_HEADER, row);
  log.info("sheets.companyAppended", { company: account.name, tier: tierFor(account.numLocations) });
}
