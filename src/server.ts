import http from "node:http";
import { config } from "./config.js";
import { log } from "./logger.js";
import { handleEngagement } from "./pipeline/engagement.js";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(); // 1MB guard
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Lightweight HTTP server for:
 *   GET  /health            → Railway health check
 *   POST /webhooks/expandi  → Expandi engagement events (connection accepted / replied)
 *
 * In Expandi, point the campaign's outbound webhook at:
 *   https://<your-railway-url>/webhooks/expandi   (optionally ?secret=EXPANDI_WEBHOOK_SECRET)
 */
export function startServer(): void {
  const server = http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      log.error("server.error", { error: String(err) });
      if (!res.headersSent) res.writeHead(500);
      res.end("error");
    });
  });
  server.listen(config.PORT, () => log.info("server.listening", { port: config.PORT }));
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = req.url ?? "/";

  if (req.method === "GET" && url.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.startsWith("/webhooks/expandi")) {
    // Optional shared-secret check (header or ?secret=).
    if (config.EXPANDI_WEBHOOK_SECRET) {
      const headerSecret = req.headers["x-webhook-secret"];
      const querySecret = new URL(url, "http://x").searchParams.get("secret");
      if (headerSecret !== config.EXPANDI_WEBHOOK_SECRET && querySecret !== config.EXPANDI_WEBHOOK_SECRET) {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
    }

    const raw = await readBody(req);
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      res.writeHead(400);
      res.end("invalid json");
      return;
    }

    // Expandi payloads vary by campaign/hook — read defensively.
    const cv = (body.custom_variables ?? {}) as Record<string, unknown>;
    const prospectId =
      (body.prospect_id as string) ?? (cv.prospect_id as string) ?? undefined;
    const eventType = String(body.event ?? body.type ?? body.hook_name ?? "engagement");
    const first = body.first_name as string | undefined;
    const last = body.last_name as string | undefined;
    const name = first ? `${first} ${last ?? ""}`.trim() : (body.name as string | undefined);
    const company = (body.company_name ?? body.company) as string | undefined;

    if (prospectId) {
      // Fire-and-forget so we ack Expandi quickly.
      handleEngagement(prospectId, eventType, { name, company }).catch((err) =>
        log.error("engagement.unhandled", { error: String(err) }),
      );
    } else {
      log.warn("webhook.noProspectId", { keys: Object.keys(body) });
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ received: true }));
    return;
  }

  res.writeHead(404);
  res.end("not found");
}
