import { completeVisionJson } from "./claude.js";
import { log } from "../logger.js";
import type { Account, Scenario } from "../types.js";

interface VisionResult {
  scenario: Scenario;
  reason: string;
}

/**
 * Look at real store photos and judge the brand's signage maturity (A/B/C).
 * Returns null if there are no images or the vision call fails, so the caller
 * can fall back to a description-based guess.
 */
export async function classifySignageFromImages(
  account: Account,
  imageUrls: string[],
): Promise<VisionResult | null> {
  if (imageUrls.length === 0) return null;

  const system = `You analyze photos of a brand's physical stores to judge their in-store signage for an LED neon sign vendor.
Return ONLY JSON: {"scenario":"A"|"B"|"C","reason":"<one sentence citing what you saw>"}.
- A = no neon-style signage visible (printed, backlit, or channel-letter signs only, or none).
- B = traditional GLASS neon visible (glass tubes, often a vintage look).
- C = LED neon visible (LED neon-flex strips forming letters or shapes).
Judge only what is actually visible. If no neon of any kind appears, choose A.`;

  const text = `Brand: ${account.name}. The following images are photos of their stores. Classify their in-store neon signage.`;

  try {
    const out = await completeVisionJson<VisionResult>({
      system,
      text,
      imageUrls,
      maxTokens: 300,
    });
    if (!["A", "B", "C"].includes(out.scenario)) return null;
    return out;
  } catch (err) {
    log.warn("signage.visionFailed", { company: account.name, error: String(err) });
    return null;
  }
}
