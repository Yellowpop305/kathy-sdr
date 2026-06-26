import "dotenv/config";
import { z } from "zod";

/**
 * All runtime configuration for Kathy, validated at boot.
 * Missing required vars fail fast with a clear message.
 */
const schema = z.object({
  // LLM brain
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),

  // Vibe Prospecting / Explorium data API
  EXPLORIUM_API_KEY: z.string().min(1, "EXPLORIUM_API_KEY is required"),
  EXPLORIUM_BASE_URL: z.string().url().default("https://api.explorium.ai/v1"),

  // Gmail (OAuth2 — Kathy's own inbox)
  GMAIL_CLIENT_ID: z.string().min(1, "GMAIL_CLIENT_ID is required"),
  GMAIL_CLIENT_SECRET: z.string().min(1, "GMAIL_CLIENT_SECRET is required"),
  GMAIL_REFRESH_TOKEN: z.string().min(1, "GMAIL_REFRESH_TOKEN is required"),
  GMAIL_SENDER: z.string().email().default("kathy@yellowpop.com"),

  // Google Sheet lead tracker (uses the SAME Google OAuth client as Gmail —
  // the refresh token must be minted with the Sheets scope too, see README).
  SHEETS_SPREADSHEET_ID: z.string().default(""),
  SHEETS_TAB: z.string().default("Leads"),
  SHEETS_COMPANIES_TAB: z.string().default("Companies"),

  // Optional: vision-based signage classifier (Scenario A/B/C from real store
  // photos). Needs a SerpAPI key for image search. If empty, Kathy falls back
  // to a description-based guess.
  SERPAPI_KEY: z.string().default(""),
  SIGNAGE_IMAGES: z.coerce.number().int().positive().default(4),

  // ---- Expandi (LinkedIn automation, webhook-based both ways) ----
  // The unique "add a lead to a campaign" webhook URL you generate inside
  // Expandi (Open API / incoming webhook). Empty = Expandi push disabled.
  EXPANDI_ADD_LEAD_URL: z.string().default(""),
  // Shared secret you set in Expandi's outbound webhook, checked on inbound events.
  EXPANDI_WEBHOOK_SECRET: z.string().default(""),
  // HTTP server: health check + Expandi event receiver.
  PORT: z.coerce.number().int().positive().default(8080),
  // Where engagement alerts (connection accepted / replied) are emailed. Empty = no email alert.
  ALERT_EMAIL: z.string().default(""),

  // Behavior
  RUN_CRON: z.string().default("0 13 * * 1-5"), // 13:00 UTC, weekdays
  ACCOUNTS_PER_RUN: z.coerce.number().int().positive().default(10),
  CONTACTS_PER_ACCOUNT: z.coerce.number().int().positive().default(3),

  // ---- Cost controls (credits) ----
  // Hard ceiling on paid contact enrichments per run — a safety brake.
  MAX_ENRICH_PER_RUN: z.coerce.number().int().positive().default(20),
  // Phone enrichment is ~5 credits/contact (email ~2) with low coverage — off by default.
  ENRICH_PHONE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Firmographics (Companies tab locations/tier) is cheap (~1 credit/account) —
  // on by default; set to "false" to disable.
  ENRICH_FIRMOGRAPHICS: z
    .string()
    .optional()
    .transform((v) => v !== "false" && v !== "0"),
  AUTO_SEND: z
    .enum(["draft_only", "send"])
    .default("draft_only"), // draft_only = human approves in Gmail before send
  DATA_DIR: z.string().default("./data"),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid configuration:\n");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = load();
