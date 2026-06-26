# Kathy — Yellowpop SDR Agent

Kathy is a standalone, autonomous SDR. On a schedule she:

1. **Sources** US brands with 50+ locations in your target verticals (Vibe Prospecting / Explorium).
2. **Classifies** each account's signage maturity into Scenario A / B / C.
3. **Finds + enriches** the right decision-makers per scenario (verified emails).
4. **Drafts** a personalized email and a LinkedIn connection note + follow-up.
5. **Delivers** — creates the email as a **Gmail draft** for human approval (or sends, if you flip a flag) and writes LinkedIn touches to a **human-actionable queue**.
6. **Schedules follow-ups** per the playbook cadence.

She runs as a long-lived worker on Railway (cron inside the process) or can be triggered once on demand.

---

## Architecture

```
                         ┌──────────────────────────┐
            cron ───────▶│   runOutreachPass()       │
                         └────────────┬──────────────┘
                                      │
   Vibe/Explorium  ◀── fetchAccounts ─┤
   (sources/vibe)  ◀── fetchContacts ─┤
                                      │
   Claude brain    ◀── classify ──────┤   (brain/classify, brain/draft)
   (Anthropic)     ◀── draft ─────────┤
                                      │
   Gmail draft     ◀── deliverEmail ──┤   (channels/gmail)
   LinkedIn queue  ◀── queueLinkedIn ─┤   (channels/linkedin)
                                      │
   JSON store      ◀── upsert ────────┘   (store/store)
```

Swappable by design: each external system lives behind one module.

---

## Quick start (local, zero credentials)

```bash
npm install
cp .env.example .env          # DRY_RUN=true is the default
npm run run-once              # runs the full loop with built-in fixtures
```

In `DRY_RUN` mode Kathy uses sample accounts/contacts, makes **no** Explorium calls and sends **no** email — but still exercises classification + drafting (needs only `ANTHROPIC_API_KEY`) and writes to `./data`. This is the fastest way to see her output.

Set `DRY_RUN=false` once your data + Gmail credentials are in place.

---

## Configuration

All config is environment variables, validated at boot (see `src/config.ts`).

| Var | Required | Notes |
|-----|----------|-------|
| `ANTHROPIC_API_KEY` | yes | Kathy's brain (classify + draft). |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-6`. |
| `EXPLORIUM_API_KEY` | yes* | Vibe Prospecting / Explorium data API. *Not needed in `DRY_RUN`. |
| `EXPLORIUM_BASE_URL` | no | Defaults to the public API base. |
| `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN` | yes* | Kathy's Gmail OAuth2. *Not needed in `DRY_RUN`. |
| `GMAIL_SENDER` | no | From address. Defaults to `kathy@yellowpop.com`. |
| `SHEETS_SPREADSHEET_ID` | no | Google Sheet lead tracker ID. Empty = skip the sheet. |
| `SHEETS_TAB` | no | Tab name. Default `Leads`. |
| `SERPAPI_KEY` | no | Enables the vision signage classifier (store-photo search). Empty = description-based fallback. |
| `SIGNAGE_IMAGES` | no | Store photos to analyze per account. Default 4. |
| `RUN_CRON` | no | UTC cron. Default `0 13 * * 1-5` (13:00 UTC weekdays). |
| `ACCOUNTS_PER_RUN` | no | Default 10. |
| `CONTACTS_PER_ACCOUNT` | no | Default 3. |
| `MAX_ENRICH_PER_RUN` | no | Hard cap on paid contact enrichments per run. Default 20. |
| `ENRICH_PHONE` | no | `true` to also enrich phone (~5 credits vs ~2 email). Default off. |
| `ENRICH_FIRMOGRAPHICS` | no | Companies-tab locations/tier (~1 credit/account). Default on; set `false` to disable. |
| `AUTO_SEND` | no | `draft_only` (default, recommended) or `send`. |
| `DATA_DIR` | no | Default `./data`. |
| `DRY_RUN` | no | `true` to run with fixtures, no external calls. |

### Gmail refresh token (one-time)

1. Google Cloud Console → enable the **Gmail API**.
2. Create an **OAuth 2.0 Client ID** (type: Desktop or Web).
3. Add scopes `https://www.googleapis.com/auth/gmail.compose` (drafts) **and** `https://www.googleapis.com/auth/spreadsheets` (lead tracker) — add `gmail.send` too only if you set `AUTO_SEND=send`.
4. Run the consent flow once (Google's OAuth Playground works) to mint a **refresh token** for `kathy@yellowpop.com`.
5. Put the client id/secret/refresh token in env.

---

## Deploy to Railway

1. Push this repo to GitHub.
2. Railway → **New Project → Deploy from GitHub repo**. It auto-detects the `Dockerfile` (config in `railway.json`).
3. Add all env vars from `.env.example` in the Railway service **Variables** tab. Set `DRY_RUN=false`.
4. The service triggers itself on `RUN_CRON` **and** runs a small HTTP server (health check + Expandi webhook receiver). Railway assigns a `PORT` automatically and gives the service a public URL — you'll point Expandi's webhook at `https://<that-url>/webhooks/expandi`.
5. **Persistence:** Railway's filesystem is ephemeral. Attach a **Volume** mounted at `/app/data` and set `DATA_DIR=/app/data`, **or** swap the store for Postgres (below). Without one of these, Kathy forgets who she's already contacted on each redeploy.

To trigger a manual run instead of waiting for cron, run `node dist/index.js --once` (e.g. a Railway one-off command).

---

## Persistence (production)

`src/store/store.ts` is a JSON-file store behind a small interface (`all`, `knownContactIds`, `upsert`, `due`, `stats`). For production durability, reimplement those five functions against Railway Postgres (`pg`). Nothing else in the codebase changes. Suggested table:

```sql
create table outreach (
  id text primary key,
  contact jsonb, account jsonb,
  scenario text, step int, status text,
  email_draft jsonb, linkedin_draft jsonb, gmail_draft_id text,
  created_at timestamptz, updated_at timestamptz, next_action_at timestamptz
);
```

---

## Channels & compliance

- **Email** runs through Kathy's Gmail. Default `draft_only` keeps a human in the loop and protects deliverability. Use a dedicated outbound domain + warm-up before scaling volume or flipping to `send`.
- **LinkedIn runs through Expandi.** LinkedIn has no compliant API for connections/messaging, so Kathy hands off to [Expandi](https://expandi.io) — she pushes each lead (profile URL + personalized note as custom variables) to your Expandi campaign's incoming webhook (`EXPANDI_ADD_LEAD_URL`), and Expandi sends the connection request + message sequence from your LinkedIn account. She also still writes `data/linkedin_queue.jsonl` as a backup feed. Keep within Expandi's safe ~300 requests/week per account (≈ 2 seats for 500/week). Account automation carries inherent risk — warm up and stay within limits.

### Engagement loop (Expandi → Kathy)

Point your Expandi campaign's **outbound** webhook at `https://<railway-url>/webhooks/expandi` (optionally `?secret=EXPANDI_WEBHOOK_SECRET`). When a lead **accepts the connection or replies**, Kathy:
1. enriches their **phone** (deferred until now to save credits),
2. updates the lead's row in the Leads tab (LinkedIn Status → Connected/Replied, Call Status → "Engaged — call", phone filled),
3. emails an **alert** to `ALERT_EMAIL`.

Matching back to the right lead relies on the `prospect_id` Kathy sends as an Expandi custom variable (and the hidden Prospect ID column in the Leads tab), so make sure your campaign passes it through to the outbound webhook.

---

## Lead tracking (Google Sheet)

Every lead Kathy works is appended as a row to a Google Sheet — your team's live source of truth. Columns:

`Date Added · Full Name · Title · Company · Email · LinkedIn URL · Phone · Scenario · Email Status · LinkedIn Status · Call Status · Email Subject · LinkedIn Note · LinkedIn Follow-up`

The three **Status** columns start in their initial state (`Drafted` / `Queued` / `To call`) and are meant to be updated by reps as actions happen, so you can see progress at a glance — who's been emailed, added on LinkedIn, or called. The **LinkedIn Note / Follow-up** columns hold Kathy's pre-written copy so you can feed them into your third-party LinkedIn outreach tool.

A second **Companies** tab logs one row per qualified account, with firmographics from enrichment:

`Date · Company · Domain · Vertical · # Locations · Tier · Revenue · Employees · Scenario · Signage Reason · City · Region · Country · Leads Found`

Tiers are derived from location count (Tier 1 = 1000+, Tier 2 = 250–999, Tier 3 = 100–249, Tier 4 = 50–99). Both tabs are created automatically if missing. The tab names are configurable via `SHEETS_TAB` and `SHEETS_COMPANIES_TAB`.

Setup:
1. Mint the refresh token with the `spreadsheets` scope included (see "Gmail refresh token" above — add both scopes in one Playground authorization).
2. Create a Google Sheet owned by (or shared with edit access to) `kathy@yellowpop.com`.
3. Copy its ID from the URL (`https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`) into `SHEETS_SPREADSHEET_ID`.
4. Leave `SHEETS_TAB=Leads` (the tab named "Leads"). Kathy writes the header row automatically on first run.

Leave `SHEETS_SPREADSHEET_ID` empty to disable the tracker (she'll just log and skip it).

Phone numbers come from Explorium contact enrichment. Coverage varies — direct dials for senior people at large brands are often missing — so expect the Phone column to be partially filled.

## Cost controls (Explorium credits)

Explorium credits are the main running cost, and contact enrichment + prospect fetch dominate. Kathy is built to avoid wasted spend:

- **No repeat work.** Accounts already processed are excluded from future fetches (`store.knownBusinessIds()` → `exclude`), and known prospects are filtered out *before* the paid enrichment call — so re-runs don't re-pay for the same people.
- **Email-only by default.** Phone enrichment (~5 credits) is opt-in via `ENRICH_PHONE`; email (~2 credits) is the default.
- **Firmographics is cheap** (~1 credit/account) and on by default; set `ENRICH_FIRMOGRAPHICS=false` to skip it.
- **Small candidate pool.** Each prospect fetch costs credits, so the pool is kept lean (12) and narrowed by the relevance judge.
- **Hard per-run cap.** `MAX_ENRICH_PER_RUN` is an absolute ceiling on paid enrichments in a single run — a run can't blow the budget.
- **Run cadence matters.** `RUN_CRON` should be daily/weekly (`0 13 * * 1-5`), never `*/5` — every-5-minutes means ~288 runs/day, each spending credits.

Rough cost per run ≈ (accounts × fetch) + (enriched contacts × ~2 email). Keep `ACCOUNTS_PER_RUN`, `CONTACTS_PER_ACCOUNT`, and `MAX_ENRICH_PER_RUN` modest until you've watched real consumption.

## Signage classification (Scenario A/B/C)

Kathy decides each account's signage maturity in two tiers:

1. **Vision (preferred)** — with a `SERPAPI_KEY` set, she searches for real store photos of the brand (`src/sources/storeImages.ts`) and has Claude *look at them* to judge whether the stores show LED neon (C), traditional glass neon (B), or none (A) — `src/brain/signage.ts`. The reason logged/written cites what was actually seen.
2. **Description fallback** — without a key (or if no usable photos are found), she falls back to a guess from the firmographic description, defaulting to A.

Tune `SIGNAGE_IMAGES` for how many photos to analyze per account (more = more accurate but more vision tokens). To swap image providers (Bing, Google CSE, a dedicated scraper), reimplement the single `findStoreImages` function — nothing else depends on it.

---

## Project layout

```
src/
  index.ts            entry: cron scheduler / --once
  config.ts           env config (zod-validated)
  logger.ts           JSON-line logger
  types.ts            shared types
  sources/vibe.ts     Explorium client + ICP filters + DRY fixtures
  brain/claude.ts     Anthropic wrapper + system prompt loader
  brain/classify.ts   scenario A/B/C classifier
  brain/draft.ts      email + LinkedIn drafters
  server.ts           HTTP server: /health + /webhooks/expandi
  channels/gmail.ts   Gmail drafts/send
  channels/linkedin.ts LinkedIn backup queue
  channels/expandi.ts push leads into Expandi campaigns
  channels/sheets.ts  Google Sheet lead tracker (Leads + Companies tabs)
  pipeline/engagement.ts  on accept/reply → phone + status update + alert
  pipeline/cadence.ts follow-up cadence
  pipeline/run.ts     orchestration
  store/store.ts      persistence (JSON; swap for Postgres)
prompts/
  kathy-system-prompt.md   Kathy's persona/playbook
```

The full strategy lives in `Kathy_SDR_Playbook.md` (delivered alongside this repo).
