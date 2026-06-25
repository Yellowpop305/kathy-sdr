import { complete, completeJson, systemPrompt } from "./claude.js";
import { icpAngle } from "./personas.js";
import type { Account, Contact, Draft, Scenario } from "../types.js";
import { SCENARIO_LABELS } from "../types.js";

interface EmailJson {
  subject: string;
  body: string;
}

const RULES = `Rules: one idea per message; subject under 5 words; body under 90 words;
exactly one CTA (a 15-minute meeting); reference something specific and true about THIS brand;
warm and human, never templated; no "I hope this finds you well"; no feature dumps; sign as Kathy.`;

function context(account: Account, contact: Contact, scenario: Scenario): string {
  const angle = icpAngle(contact.icp);
  return `Brand: ${account.name} (${account.domain})
Vertical: ${account.vertical ?? "multi-location brand"}
Locations: ${account.numLocationsBucket ?? "50+"}
City: ${account.city ?? "n/a"}
Contact: ${contact.firstName} — ${contact.title}
ICP: ${contact.icp ?? "Brand"}
Angle to lead with for this ICP: ${angle}
Signage scenario: ${scenario} (${SCENARIO_LABELS[scenario]})
Brand notes: ${account.description ?? "n/a"}`;
}

export async function draftEmail(
  account: Account,
  contact: Contact,
  scenario: Scenario,
): Promise<Draft> {
  const system = await systemPrompt();
  const user = `Write a cold OUTBOUND EMAIL from Kathy to this contact.
${RULES}
Return ONLY JSON: {"subject":"...","body":"..."}.

${context(account, contact, scenario)}`;
  const out = await completeJson<EmailJson>({ system, user, maxTokens: 512 });
  return { channel: "email", subject: out.subject, body: out.body };
}

export async function draftLinkedIn(
  account: Account,
  contact: Contact,
  scenario: Scenario,
): Promise<Draft> {
  const system = await systemPrompt();
  const user = `Write a LinkedIn connection note AND a post-accept follow-up message from Kathy.
Connection note must be under 300 characters. Follow-up under 80 words.
${RULES}
Output the connection note, then a line with exactly "---", then the follow-up. No other text.

${context(account, contact, scenario)}`;
  const body = await complete({ system, user, maxTokens: 400 });
  return { channel: "linkedin", body };
}
