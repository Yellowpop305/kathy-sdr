import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { log } from "../logger.js";
import { fetchAccounts, fetchContacts } from "../sources/vibe.js";
import { classifyAccount } from "../brain/classify.js";
import { draftEmail, draftLinkedIn } from "../brain/draft.js";
import { deliverEmail } from "../channels/gmail.js";
import { queueLinkedIn } from "../channels/linkedin.js";
import { appendLead } from "../channels/sheets.js";
import { store } from "../store/store.js";
import { nextActionAt } from "./cadence.js";
import type { OutreachRecord } from "../types.js";

/**
 * One full pass of Kathy's outbound loop:
 *   source accounts → classify scenario → source+enrich contacts →
 *   draft email + LinkedIn → deliver (Gmail draft / LinkedIn queue) → record.
 */
export async function runOutreachPass(): Promise<void> {
  const startedAt = Date.now();
  log.info("run.start", { accountsPerRun: config.ACCOUNTS_PER_RUN });

  const accounts = await fetchAccounts(config.ACCOUNTS_PER_RUN);
  const known = await store.knownContactIds();
  let enrolled = 0;

  for (const account of accounts) {
    try {
      const { scenario, reason } = await classifyAccount(account);
      account.scenario = scenario;
      account.scenarioReason = reason;
      log.info("account.classified", { name: account.name, scenario });

      const contacts = await fetchContacts(account, scenario, config.CONTACTS_PER_ACCOUNT);

      for (const contact of contacts) {
        if (known.has(contact.prospectId)) continue;

        const [email, linkedin] = await Promise.all([
          contact.email ? draftEmail(account, contact, scenario) : Promise.resolve(undefined),
          draftLinkedIn(account, contact, scenario),
        ]);

        let gmailDraftId: string | undefined;
        if (email && contact.email) {
          const res = await deliverEmail(contact.email, email);
          gmailDraftId = res.id;
        }
        await queueLinkedIn(contact, account.name, linkedin);

        const emailStatus = config.AUTO_SEND === "send" ? "Sent" : "Drafted";
        await appendLead({
          account,
          contact,
          scenario,
          emailDraft: email,
          linkedinDraft: linkedin,
          emailStatus,
        });

        const now = new Date().toISOString();
        const record: OutreachRecord = {
          id: randomUUID(),
          contact,
          account,
          scenario,
          step: 0,
          status: config.AUTO_SEND === "send" ? "sent" : "drafted",
          emailDraft: email,
          linkedinDraft: linkedin,
          gmailDraftId,
          createdAt: now,
          updatedAt: now,
          nextActionAt: nextActionAt(0),
        };
        await store.upsert(record);
        known.add(contact.prospectId);
        enrolled++;
      }
    } catch (err) {
      log.error("account.failed", { name: account.name, error: String(err) });
    }
  }

  await store.stats();
  log.info("run.done", {
    accounts: accounts.length,
    enrolled,
    ms: Date.now() - startedAt,
  });
}
