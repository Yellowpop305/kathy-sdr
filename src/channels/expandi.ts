import { request } from "undici";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Contact, Draft } from "../types.js";

/**
 * Expandi — LinkedIn automation. Kathy pushes each lead into an Expandi
 * campaign via the unique "add a lead" webhook URL you generate in Expandi
 * (Settings → Open API / Webhooks). Expandi then sends the connection request
 * + message sequence from your LinkedIn account.
 *
 * NOTE: confirm the exact field names Expandi expects on your incoming webhook.
 * The payload below sends the LinkedIn profile URL, name, and custom variables
 * (the personalized note + follow-up) that your campaign template references as
 * snippets like {{note}} / {{follow_up}}. Adjust keys to match your campaign.
 */

function splitLinkedIn(draft?: Draft): { note: string; followUp: string } {
  if (!draft) return { note: "", followUp: "" };
  const [note, followUp] = draft.body.split("\n---\n");
  return { note: (note ?? draft.body).trim(), followUp: (followUp ?? "").trim() };
}

export interface ExpandiResult {
  action: "pushed" | "skipped";
  reason?: string;
}

export async function pushToExpandi(
  contact: Contact,
  company: string,
  linkedinDraft?: Draft,
): Promise<ExpandiResult> {
  if (!config.EXPANDI_ADD_LEAD_URL) return { action: "skipped", reason: "not configured" };
  if (!contact.linkedinUrl) return { action: "skipped", reason: "no LinkedIn URL" };
  if (config.DRY_RUN) {
    log.info("expandi.dryRun", { name: contact.fullName });
    return { action: "skipped", reason: "dry run" };
  }

  const { note, followUp } = splitLinkedIn(linkedinDraft);
  const payload = {
    profile_link: contact.linkedinUrl,
    first_name: contact.firstName,
    last_name: contact.fullName.split(" ").slice(1).join(" "),
    company_name: company,
    // Per-lead personalization referenced by the campaign template as snippets.
    custom_variables: {
      prospect_id: contact.prospectId, // so inbound events can be matched back
      icp: contact.icp ?? "",
      note,
      follow_up: followUp,
    },
  };

  try {
    const res = await request(config.EXPANDI_ADD_LEAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      log.warn("expandi.pushFailed", {
        name: contact.fullName,
        status: res.statusCode,
        body: text.slice(0, 200),
      });
      return { action: "skipped", reason: `http ${res.statusCode}` };
    }
    log.info("expandi.pushed", { name: contact.fullName, company });
    return { action: "pushed" };
  } catch (err) {
    log.warn("expandi.error", { name: contact.fullName, error: String(err) });
    return { action: "skipped", reason: "error" };
  }
}
