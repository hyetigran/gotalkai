import { put } from "@vercel/blob";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export type WaitlistResult =
  | { ok: true; store: "blob" | "local" }
  | { ok: false; error: string };

export async function persistWaitlistEmail(
  rawEmail: string,
): Promise<WaitlistResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const email = parsed.data;
  const entry = {
    email,
    createdAt: new Date().toISOString(),
    source: "landing" as const,
  };
  const line = `${JSON.stringify(entry)}\n`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Blob currently only supports public access; path is unguessable.
    const digest = createHash("sha256").update(email).digest("hex").slice(0, 12);
    const nonce = randomBytes(6).toString("hex");
    const key = `waitlist/${Date.now()}-${digest}-${nonce}.json`;
    await put(key, JSON.stringify(entry), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
    });
    return { ok: true, store: "blob" };
  }

  // Vercel serverless FS is read-only — local JSONL only works off-platform.
  if (process.env.VERCEL) {
    return {
      ok: false,
      error: "Waitlist storage is not configured. Try again later.",
    };
  }

  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "waitlist.jsonl"), line, "utf8");
  return { ok: true, store: "local" };
}
