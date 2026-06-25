import { completeJson } from "./claude.js";
import type { Account, Scenario } from "../types.js";

interface ClassifyResult {
  scenario: Scenario;
  reason: string;
}

/**
 * Classify an account's signage maturity into Scenario A / B / C.
 *
 * This uses only the firmographic description available from the data source.
 * For higher accuracy, feed in scraped store-photo / website signals (see
 * README → "Improving classification"). When evidence is thin, default to A.
 */
export async function classifyAccount(account: Account): Promise<ClassifyResult> {
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
