import { completeJson } from "./claude.js";
import { PERSONA_DEFINITION } from "./personas.js";
import { log } from "../logger.js";

export interface Candidate {
  prospectId: string;
  title: string;
}

interface RelevanceResult {
  relevant: number[]; // indices of relevant candidates, best first
}

/**
 * LLM relevance judge. Given a pool of candidate prospects (by title), returns
 * the prospect IDs that genuinely fit the Yellowpop persona — reasoning about
 * each role rather than matching a fixed list — ranked best-first and capped.
 *
 * Falls back to the first `max` candidates if the model call fails, so a
 * hiccup never drops an account entirely.
 */
export async function selectRelevantProspects(
  candidates: Candidate[],
  max: number,
): Promise<string[]> {
  if (candidates.length <= max) return candidates.map((c) => c.prospectId);

  const system = `You score how well each person's job title fits a target persona for outreach.
${PERSONA_DEFINITION}

You will get a numbered list of job titles. Return ONLY JSON:
{"relevant":[<indices of people who FIT the persona, most relevant first>]}
Exclude anyone in the NOT-relevant list. If none fit, return {"relevant":[]}.`;

  const list = candidates.map((c, i) => `${i}. ${c.title || "(no title)"}`).join("\n");

  try {
    const out = await completeJson<RelevanceResult>({
      system,
      user: `Candidates:\n${list}\n\nReturn the indices that fit, best first.`,
      maxTokens: 512,
    });
    const ids = (out.relevant ?? [])
      .filter((i) => Number.isInteger(i) && i >= 0 && i < candidates.length)
      .map((i) => candidates[i]!.prospectId)
      .slice(0, max);
    if (ids.length > 0) return ids;
    log.warn("relevance.emptyResult", { pool: candidates.length });
  } catch (err) {
    log.warn("relevance.failed", { error: String(err) });
  }
  return candidates.slice(0, max).map((c) => c.prospectId);
}
