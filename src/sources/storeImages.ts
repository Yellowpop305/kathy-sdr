import { request } from "undici";
import { config } from "../config.js";
import { log } from "../logger.js";
import type { Account } from "../types.js";

/**
 * Find a few real store photos for a brand via SerpAPI (Google Images).
 * Returns direct image URLs (used by the vision signage classifier).
 * No-op (returns []) when SERPAPI_KEY isn't set, so the pipeline still runs.
 *
 * Swap this one function to change image providers (Bing, Google CSE, a
 * scraper, etc.) — nothing else depends on the provider.
 */
export async function findStoreImages(account: Account, max: number): Promise<string[]> {
  if (!config.SERPAPI_KEY || config.DRY_RUN) return [];

  // A "store design" image search surfaces store interiors where signage is
  // clearly visible — a strong, simple signal for the A/B/C classifier.
  const q = `store design "${account.name}"`;
  const url =
    `https://serpapi.com/search.json?engine=google_images` +
    `&q=${encodeURIComponent(q)}&ijn=0&api_key=${config.SERPAPI_KEY}`;

  try {
    const res = await request(url, { method: "GET" });
    if (res.statusCode >= 400) {
      log.warn("storeImages.httpError", { company: account.name, status: res.statusCode });
      return [];
    }
    const data = (await res.body.json()) as {
      images_results?: Array<{ original?: string; thumbnail?: string }>;
    };
    const urls = (data.images_results ?? [])
      .map((r) => r.original ?? r.thumbnail)
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      .slice(0, max);
    log.debug("storeImages.found", { company: account.name, count: urls.length });
    return urls;
  } catch (err) {
    log.warn("storeImages.failed", { company: account.name, error: String(err) });
    return [];
  }
}
