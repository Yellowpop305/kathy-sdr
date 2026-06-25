/** Signage maturity scenario — drives who we target and what we say. */
export type Scenario = "A" | "B" | "C";

export const SCENARIO_LABELS: Record<Scenario, string> = {
  A: "No neon/LED signage today",
  B: "Uses real (glass) neon",
  C: "Already uses LED neon",
};

export interface Account {
  businessId: string;
  name: string;
  domain: string;
  city?: string;
  region?: string;
  vertical?: string;
  description?: string;
  numLocationsBucket?: string;
  scenario?: Scenario;
  scenarioReason?: string;
  // Firmographics (from enrichment) used to qualify the company.
  numLocations?: number;
  revenueRange?: string;
  employeeRange?: string;
  country?: string;
}

export interface Contact {
  prospectId: string;
  businessId: string;
  fullName: string;
  firstName: string;
  title: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  /** Which of the four ICPs this person belongs to (Brand / Retail / Store Design / Construction / Procurement). */
  icp?: string;
}

export type Channel = "email" | "linkedin";

export interface Draft {
  channel: Channel;
  subject?: string; // email only
  body: string;
}

export type OutreachStatus =
  | "drafted"
  | "queued"
  | "sent"
  | "replied"
  | "stopped";

export interface OutreachRecord {
  id: string;
  contact: Contact;
  account: Account;
  scenario: Scenario;
  step: number; // index into the cadence
  status: OutreachStatus;
  emailDraft?: Draft;
  linkedinDraft?: Draft;
  gmailDraftId?: string;
  createdAt: string;
  updatedAt: string;
  nextActionAt?: string;
}
