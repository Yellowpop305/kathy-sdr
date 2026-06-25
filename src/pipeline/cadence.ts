import type { Channel } from "../types.js";

/** Follow-up cadence from the playbook (day offsets from first touch). */
export interface CadenceStep {
  day: number;
  channel: Channel;
  kind: "first" | "follow_up" | "breakup" | "checkin";
  note: string;
}

export const CADENCE: CadenceStep[] = [
  { day: 0, channel: "email", kind: "first", note: "First touch (scenario template)" },
  { day: 0, channel: "linkedin", kind: "first", note: "Connection request + note" },
  { day: 3, channel: "linkedin", kind: "follow_up", note: "If accepted, follow-up message" },
  { day: 4, channel: "email", kind: "follow_up", note: "Bump + one proof point / mockup" },
  { day: 8, channel: "email", kind: "follow_up", note: "New angle (case study / photo)" },
  { day: 12, channel: "linkedin", kind: "checkin", note: "Soft check-in" },
  { day: 16, channel: "email", kind: "breakup", note: "Break-up email" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Given the current step index, when is the next action due? */
export function nextActionAt(currentStep: number, from = new Date()): string | undefined {
  const current = CADENCE[currentStep];
  const next = CADENCE[currentStep + 1];
  if (!current || !next) return undefined;
  const deltaDays = next.day - current.day;
  return new Date(from.getTime() + deltaDays * DAY_MS).toISOString();
}
