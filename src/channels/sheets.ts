import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Account, Contact, Draft, Scenario } from "../types.js";
import { SCENARIO_LABELS } from "../types.js";

/**
 * Google Sheet lead tracker — the team's live source of truth.
 *
 * One row per lead. Status columns (Email / LinkedIn / Call) start in their
 * initial state and are meant to be updated by reps (or by a future status
 * sync) as actions happen. The LinkedIn Note + Follow-up columns are written
 * so they can feed your third-party LinkedIn outreach tool.
 *
 * Auth reuses the SAME Google OAuth client as Gmail. The refresh token must be
 * minted with BOTH scopes: gmail.compose AND spreadsheets (see README).
 */

const HEADER = [
  "Date Added",
  "Full Name",
  "Title",
  "Company",
  "Email",
  "LinkedIn URL",
  "Phone",
  "Scenario",
  "Email Status",
  "LinkedIn Status",
  "Call Status",
  "Email Subject",
  "LinkedIn Note",
  "LinkedIn Follow-up",
];

let headerEnsured = false;

function client(): sheets_v4.Sheets {
  const oauth2 = new google.auth.OAuth2(
    config.GMAIL_CLIENT_ID,
    config.GMAIL_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN });
  return google.sheets({ version: "v4", auth: oauth2 });
}

async function ensureHeader(sheets: sheets_v4.Sheets): Promise<void> {
  if (headerEnsured) return;
  const tab = config.SHEETS_TAB;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.SHEETS_SPREADSHEET_ID,
    range: `${tab}!A1:N1`,
  });
  const hasHeader = (res.data.values?.[0]?.length ?? 0) > 0;
  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.SHEETS_SPREADSHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
    log.info("sheets.headerWritten", { tab });
  }
  headerEnsured = true;
}

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

/** Append one lead to the tracker. No-op (logged) in DRY_RUN or if no sheet configured. */
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
    contact.email ?? "",
    contact.linkedinUrl ?? "",
    contact.phone ?? "",
    `${scenario} — ${SCENARIO_LABELS[scenario]}`,
    contact.email ? emailStatus : "No email",
    "Queued",
    contact.phone ? "To call" : "No phone",
    emailDraft?.subject ?? "",
    li.note,
    li.followUp,
  ];

  if (config.DRY_RUN) {
    log.info("sheets.dryRun", { name: contact.fullName, company: account.name });
    return;
  }

  const sheets = client();
  await ensureHeader(sheets);
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.SHEETS_SPREADSHEET_ID,
    range: `${config.SHEETS_TAB}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  log.info("sheets.appended", { name: contact.fullName, company: account.name });
}
