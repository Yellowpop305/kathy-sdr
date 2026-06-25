import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { request } from "undici";
import { config } from "../config.js";
import { log } from "../logger.js";

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

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const json = start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(json) as T;
}

/** Completion that must return JSON. Strips fences and parses. */
export async function completeJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  return parseJson<T>(await complete(opts));
}

const IMG_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImgMedia = (typeof IMG_TYPES)[number];

/** Fetch an image URL and turn it into a base64 image block (null if unusable). */
async function fetchImageBlock(url: string): Promise<Anthropic.ImageBlockParam | null> {
  try {
    const res = await request(url, { method: "GET", maxRedirections: 3 });
    if (res.statusCode >= 400) return null;
    const media = String(res.headers["content-type"] ?? "").split(";")[0]!.trim();
    if (!IMG_TYPES.includes(media as ImgMedia)) return null;
    const buf = Buffer.from(await res.body.arrayBuffer());
    if (buf.length === 0 || buf.length > 4_500_000) return null; // ~4.5MB cap
    return {
      type: "image",
      source: { type: "base64", media_type: media as ImgMedia, data: buf.toString("base64") },
    };
  } catch {
    return null;
  }
}

/** Vision completion: sends text + (fetched) images, returns parsed JSON. */
export async function completeVisionJson<T>(opts: {
  system: string;
  text: string;
  imageUrls: string[];
  maxTokens?: number;
}): Promise<T> {
  const blocks = (await Promise.all(opts.imageUrls.map(fetchImageBlock))).filter(
    (b): b is Anthropic.ImageBlockParam => b !== null,
  );
  if (blocks.length === 0) throw new Error("no usable images");

  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: opts.text }, ...blocks];
  const res = await anthropic.messages.create({
    model: config.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 512,
    system: opts.system,
    messages: [{ role: "user", content }],
  });
  log.debug("vision.done", { images: blocks.length });
  const raw = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
  return parseJson<T>(raw);
}
