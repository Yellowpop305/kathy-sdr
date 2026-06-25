import { completeJson } from "./claude.js";
import { PERSONA_DEFINITION } from "./personas.js";
import type { IcpCategory } from "./personas.js";
import { log } from "../logger.js";

export interface Candidate {
  prospectId: string;
  title: string;
}

export interface Selection {
  prospectId: string;
  icp: IcpCategory;
}

interface RelevanceRow {
  i: number;
  icp: IcpCategory;
}
interface RelevanceResult {
  relevant: RelevanceRow[]; // best first
}

const VALID_ICPS = new Set<string>([
  "Brand",
  "Retail / Store Design",
  "Construction",
  "Procurement",
]);

/**
 * LLM relevance judge. Reasons about each candidate's title against the
 * Yellowpop persona, keeps genuine fits (excludes execs / irrelevant roles),
 * classifies each into one of the four ICPs, ranks best-first, and caps at max.
 *
 * Falls back to the first `max` candidates (ICP "Brand") if the model call
 * fails, so a hiccup never drops an account entirely.
 */
export async function selectRelevantProspects(
  candidates: Candidate[],
  max: number,
): Promise<Selection[]> {
  const fallback = (): Selection[] =>
    candidates.slice(0, max).map((c) => ({ prospectId: c.prospectId, icp: "Brand" as IcpCategory }));

  if (candidates.length === 0) return [];

  const system = `You score how well each person fits a target persona for outreach, and assign an ICP.
${PERSONA_DEFINITION}

You will get a numbered list of job titles. Return ONLY JSON:
{"relevant":[{"i":<index>,"icp":"Brand"|"Retail / Store Design"|"Construction"|"Procurement"}, ...]}
List the people who FIT, most relevant first. Exclude anyone in the NOT-relevant list. If none fit, return {"relevant":[]}.`;

  const list = candidates.map((c, i) => `${i}. ${c.title || "(no title)"}`).join("\n");

  try {
    const out = await completeJson<RelevanceResult>({
      system,
      user: `Candidates:\n${list}\n\nReturn the fits, best first, each with its ICP.`,
      maxTokens: 700,
    });
    const picks = (out.relevant ?? [])
      .filter(
        (r) =>
          Number.isInteger(r.i) &&
          r.i >= 0 &&
          r.i < candidates.length &&
          VALID_ICPS.has(r.icp),
      )
      .map((r) => ({ prospectId: candidates[r.i]!.prospectId, icp: r.icp }))
      .slice(0, max);
    if (picks.length > 0) return picks;
    log.warn("relevance.emptyResult", { pool: candidates.length });
    return [];
  } catch (err) {
    log.warn("relevance.failed", { error: String(err) });
    return fallback();
  }
}
