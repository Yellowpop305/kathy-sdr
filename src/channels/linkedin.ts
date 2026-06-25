import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Contact, Draft } from "../types.js";

/**
 * LinkedIn channel — INTENTIONALLY not automated.
 *
 * LinkedIn's terms prohibit automated connection requests and messaging via
 * unofficial APIs, and doing so risks Kathy's account being restricted. So
 * this channel produces a human-actionable QUEUE: a JSONL/CSV file of
 * connection notes + follow-ups that a person (or Kathy operating her own
 * logged-in browser) sends manually, within safe daily limits.
 *
 * Keep sends to ~15–25 connection requests/day on a warmed account.
 */

const QUEUE_FILE = () => path.join(config.DATA_DIR, "linkedin_queue.jsonl");

export interface LinkedInQueueItem {
  fullName: string;
  title: string;
  company: string;
  linkedinUrl?: string;
  connectionNote: string;
  followUp: string;
  queuedAt: string;
}

export async function queueLinkedIn(
  contact: Contact,
  company: string,
  draft: Draft,
): Promise<void> {
  // Convention: the draft body packs the connection note and follow-up,
  // separated by a marker, so the brain can produce both in one call.
  const [connectionNote, followUp] = draft.body.split("\n---\n");
  const item: LinkedInQueueItem = {
    fullName: contact.fullName,
    title: contact.title,
    company,
    linkedinUrl: contact.linkedinUrl,
    connectionNote: (connectionNote ?? draft.body).trim(),
    followUp: (followUp ?? "").trim(),
    queuedAt: new Date().toISOString(),
  };
  await fs.mkdir(config.DATA_DIR, { recursive: true });
  await fs.appendFile(QUEUE_FILE(), JSON.stringify(item) + "\n", "utf8");
  log.info("linkedin.queued", { name: contact.fullName, company });
}
