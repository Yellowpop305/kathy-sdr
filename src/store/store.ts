import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { OutreachRecord } from "../types.js";

/**
 * Simple JSON-file persistence. Good enough to prove the loop and run on a
 * single instance.
 *
 * ⚠️ Railway's filesystem is EPHEMERAL — it resets on every deploy/restart.
 * For production, attach a Railway Volume and point DATA_DIR at it, OR swap
 * this module for a Postgres-backed store (see README → "Persistence").
 * The rest of the codebase only depends on the exported functions below,
 * so swapping the backend is a contained change.
 */

const FILE = () => path.join(config.DATA_DIR, "outreach.json");

async function ensureDir() {
  await fs.mkdir(config.DATA_DIR, { recursive: true });
}

async function readAll(): Promise<OutreachRecord[]> {
  try {
    const raw = await fs.readFile(FILE(), "utf8");
    return JSON.parse(raw) as OutreachRecord[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(records: OutreachRecord[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE(), JSON.stringify(records, null, 2), "utf8");
}

export const store = {
  async all(): Promise<OutreachRecord[]> {
    return readAll();
  },

  /** Contact IDs we've already touched — so we never double-enroll someone. */
  async knownContactIds(): Promise<Set<string>> {
    const records = await readAll();
    return new Set(records.map((r) => r.contact.prospectId));
  },

  /** Account IDs we've already worked — excluded from future account fetches. */
  async knownBusinessIds(): Promise<Set<string>> {
    const records = await readAll();
    return new Set(records.map((r) => r.account.businessId));
  },

  async upsert(record: OutreachRecord): Promise<void> {
    const records = await readAll();
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    await writeAll(records);
  },

  /** Records whose next follow-up is due. */
  async due(now = new Date()): Promise<OutreachRecord[]> {
    const records = await readAll();
    return records.filter(
      (r) =>
        (r.status === "queued" || r.status === "sent") &&
        r.nextActionAt != null &&
        new Date(r.nextActionAt) <= now,
    );
  },

  async stats(): Promise<Record<string, number>> {
    const records = await readAll();
    const out: Record<string, number> = {};
    for (const r of records) out[r.status] = (out[r.status] ?? 0) + 1;
    log.info("store.stats", out);
    return out;
  },
};
