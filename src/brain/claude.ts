import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedPrompt: string | null = null;

/** Kathy's persona / playbook, loaded once and reused as the system prompt. */
export async function systemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  const p = path.join(__dirname, "..", "..", "prompts", "kathy-system-prompt.md");
  cachedPrompt = await fs.readFile(p, "utf8");
  return cachedPrompt;
}

/** Single-turn completion. Returns the concatenated text content. */
export async function complete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await anthropic.messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}

/** Completion that must return JSON. Strips fences and parses. */
export async function completeJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const raw = await complete(opts);
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const json = start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(json) as T;
}
