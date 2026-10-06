import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  SUPABASE_URL: z.string({ error: "is required" }).url("must be a valid URL, e.g. https://<ref>.supabase.co"),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ error: "is required" }).min(1, "must not be empty"),
  // Optional hardening / tuning
  SUPABASE_READ_ONLY: bool,
  SUPABASE_ALLOWED_TABLES: z.string().optional(),
  SUPABASE_MAX_ROWS: z.coerce.number().int().min(1).max(10000).default(1000),
  SUPABASE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
});

/**
 * Validates and normalises environment variables into a config object.
 * Throws an Error with a readable, multi-line message when invalid.
 */
export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = parsed.data;
  const allowed = (e.SUPABASE_ALLOWED_TABLES ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    url: e.SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY,
    readOnly: e.SUPABASE_READ_ONLY,
    allowedTables: allowed.length ? new Set(allowed) : null,
    maxRows: e.SUPABASE_MAX_ROWS,
    timeoutMs: e.SUPABASE_TIMEOUT_MS,
  };
}
