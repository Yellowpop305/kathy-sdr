import { config } from "../config.js";
import { log } from "../logger.js";
import { enrichPhone } from "../sources/vibe.js";
import { updateLeadByProspect } from "../channels/sheets.js";
import { deliverEmail } from "../channels/gmail.js";

/**
 * Phase-2: a lead engaged (accepted the connection or replied). Now — and only
 * now — we spend the phone-enrichment credit, flag the lead for a call, update
 * the tracker, and alert the team.
 */
export async function handleEngagement(
  prospectId: string,
  eventType: string,
  meta: { name?: string; company?: string } = {},
): Promise<void> {
  const replied = /repl|message|inmail/i.test(eventType);
  const linkedinStatus = replied ? "Replied" : "Connected";
  log.info("engagement.received", { prospectId, eventType, linkedinStatus });

  // Interested → get the phone now (deferred until engagement to save credits).
  const phone = await enrichPhone(prospectId);

  await updateLeadByProspect(prospectId, {
    linkedinStatus,
    callStatus: phone ? "Engaged — call" : "Engaged — no phone",
    phone,
  });

  if (config.ALERT_EMAIL) {
    try {
      await deliverEmail(config.ALERT_EMAIL, {
        channel: "email",
        subject: `Kathy: ${meta.name ?? "a lead"} engaged on LinkedIn`,
        body:
          `${meta.name ?? "A prospect"}${meta.company ? ` at ${meta.company}` : ""} just ` +
          `${replied ? "replied to a message" : "accepted the connection"} on LinkedIn.\n\n` +
          `Phone: ${phone ?? "not found"}\nProspect ID: ${prospectId}\n\nTime to follow up.`,
      });
      log.info("engagement.alerted", { prospectId, to: config.ALERT_EMAIL });
    } catch (err) {
      log.warn("engagement.alertFailed", { error: String(err) });
    }
  }
}
