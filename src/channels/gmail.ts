import { google } from "googleapis";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Draft } from "../types.js";

/**
 * Gmail channel — creates drafts in Kathy's inbox (and optionally sends).
 *
 * Default mode is `draft_only`: Kathy writes the email as a Gmail draft and a
 * human approves + sends. Set AUTO_SEND=send to have her send directly (only
 * once deliverability + warm-up are sorted).
 */

function client() {
  const oauth2 = new google.auth.OAuth2(
    config.GMAIL_CLIENT_ID,
    config.GMAIL_CLIENT_SECRET,
  );
  oauth2.setCredentials({ refresh_token: config.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function toRaw(to: string, subject: string, body: string): string {
  const headers = [
    `From: ${config.GMAIL_SENDER}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
  ];
  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface GmailResult {
  action: "drafted" | "sent" | "skipped";
  id?: string;
}

export async function deliverEmail(to: string, draft: Draft): Promise<GmailResult> {
  const subject = draft.subject ?? "(no subject)";

  if (config.DRY_RUN) {
    log.info("gmail.dryRun", { to, subject });
    return { action: "skipped" };
  }

  const gmail = client();
  const raw = toRaw(to, subject, draft.body);

  if (config.AUTO_SEND === "send") {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    log.info("gmail.sent", { to, id: res.data.id });
    return { action: "sent", id: res.data.id ?? undefined };
  }

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  log.info("gmail.drafted", { to, id: res.data.id });
  return { action: "drafted", id: res.data.id ?? undefined };
}
