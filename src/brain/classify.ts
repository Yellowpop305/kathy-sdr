import { completeJson } from "./claude.js";
import { config } from "../config.js";
import { log } from "../logger.js";
import { findStoreImages } from "../sources/storeImages.js";
import { classifySignageFromImages } from "./signage.js";
import type { Account, Scenario } from "../types.js";

interface ClassifyResult {
  scenario: Scenario;
  reason: string;
}

/**
 * Classify an account's signage maturity into Scenario A / B / C.
 *
 * Primary: look at real store photos (SerpAPI image search → Claude vision).
 * Fallback: a description-based guess when no images/key are available.
 */
export async function classifyAccount(account: Account): Promise<ClassifyResult> {
  // Vision-first: judge from actual store photos when we can.
  if (config.SERPAPI_KEY && !config.DRY_RUN) {
    try {
      const images = await findStoreImages(account, config.SIGNAGE_IMAGES);
      const vision = await classifySignageFromImages(account, images);
      if (vision) {
        log.info("classify.vision", {
          company: account.name,
          scenario: vision.scenario,
          images: images.length,
        });
        return vision;
      }
    } catch (err) {
      log.warn("classify.visionError", { company: account.name, error: String(err) });
    }
  }
  return classifyFromDescription(account);
}

/** Description-only fallback classifier. */
async function classifyFromDescription(account: Account): Promise<ClassifyResult> {
  log.info("classify.fallback", {
    company: account.name,
    reason: config.SERPAPI_KEY ? "no usable store photos" : "SERPAPI_KEY not set",
  });
  const system = `You classify retail/hospitality brands by their in-store signage maturity for an LED neon sign vendor.
Return ONLY JSON: {"scenario":"A"|"B"|"C","reason":"<one sentence>"}.
- A = no neon or LED signage evident (default when unsure)
- B = uses traditional glass neon
- C = already uses LED neon signage
Base it on the brand description and any signage cues. When evidence is weak, choose A.`;

  const user = `Brand: ${account.name}
Vertical: ${account.vertical ?? "unknown"}
Locations bucket: ${account.numLocationsBucket ?? "unknown"}
Description: ${account.description ?? "n/a"}`;

  try {
    const out = await completeJson<ClassifyResult>({ system, user, maxTokens: 256 });
    if (!["A", "B", "C"].includes(out.scenario)) {
      return { scenario: "A", reason: "Fallback: unrecognized classification." };
    }
    return out;
  } catch {
    return { scenario: "A", reason: "Fallback: classification error, default to A." };
  }
}
