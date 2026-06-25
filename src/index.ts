import cron from "node-cron";
import { config } from "./config.js";
import { log } from "./logger.js";
import { runOutreachPass } from "./pipeline/run.js";

/**
 * Entry point.
 *   - `node dist/index.js --once`  → run a single pass and exit (good for testing / manual triggers).
 *   - `node dist/index.js`         → start the cron scheduler and stay up (Railway worker).
 */
async function main() {
  const once = process.argv.includes("--once");

  log.info("kathy.boot", {
    mode: once ? "once" : "scheduled",
    cron: config.RUN_CRON,
    autoSend: config.AUTO_SEND,
    dryRun: config.DRY_RUN ?? false,
    model: config.ANTHROPIC_MODEL,
  });

  if (once) {
    await runOutreachPass();
    log.info("kathy.exit", { reason: "single pass complete" });
    return;
  }

  if (!cron.validate(config.RUN_CRON)) {
    log.error("kathy.badCron", { cron: config.RUN_CRON });
    process.exit(1);
  }

  cron.schedule(config.RUN_CRON, () => {
    runOutreachPass().catch((err) =>
      log.error("run.unhandled", { error: String(err) }),
    );
  });

  log.info("kathy.scheduled", { cron: config.RUN_CRON });

  // Keep the process alive.
  process.stdin.resume();
}

main().catch((err) => {
  log.error("kathy.fatal", { error: String(err) });
  process.exit(1);
});
