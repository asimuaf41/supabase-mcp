import { z } from "zod";

const MAX_RESPONSE_CHARS = 100_000;

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const identifier = (label) =>
  z.string().regex(IDENTIFIER, `Invalid ${label}: use letters, digits and underscores only`);

export function log(level, message, extra) {
  // stdout is reserved for the MCP protocol: always log to stderr.
  const line = `[supabase-mcp] ${level.toUpperCase()} ${message}`;
  console.error(extra ? `${line} ${JSON.stringify(extra)}` : line);
}

/** Successful tool result. Large payloads are truncated to protect the context window. */
export function textResult(data) {
  let text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length > MAX_RESPONSE_CHARS) {
    text =
      text.slice(0, MAX_RESPONSE_CHARS) +
      `\n\n[truncated: response exceeded ${MAX_RESPONSE_CHARS} characters. Use "select", "filter" or a smaller "limit" to narrow it.]`;
  }
  return { content: [{ type: "text", text }] };
}

export function errorResult(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Formats a Supabase/PostgREST error object into one actionable line. */
export function dbError(error) {
  // supabase-js reports transport failures as an error object (not a throw).
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|timed? ?out/i.test(`${error.message} ${error.details ?? ""}`)) {
    return describeError(Object.assign(new Error("fetch failed"), { name: /timed? ?out/i.test(error.message) ? "TimeoutError" : "Error" }));
  }
  const parts = [error.message];
  if (error.details) parts.push(`details: ${String(error.details).split("\n")[0].slice(0, 200)}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  if (error.code) parts.push(`code: ${error.code}`);
  return parts.join(" | ");
}

/** Turns thrown errors (network, timeout, bugs) into a readable message. */
export function describeError(err) {
  if (!err) return "Unknown error";
  const cause = err.cause?.code || err.cause?.message;
  if (err.name === "TimeoutError" || err.name === "AbortError") {
    return "Request to Supabase timed out. Check connectivity or raise SUPABASE_TIMEOUT_MS.";
  }
  if (err.message === "fetch failed") {
    return `Could not reach Supabase${cause ? ` (${cause})` : ""}. Check SUPABASE_URL and your network.`;
  }
  return err.message ?? String(err);
}

/** Wraps a tool handler so it can never throw out of the MCP request loop. */
export const safe = (name, fn) => async (args) => {
  try {
    return await fn(args);
  } catch (err) {
    log("error", `${name} failed: ${err?.message ?? err}`);
    return errorResult(describeError(err));
  }
};

/** Escapes LIKE wildcards so user text is matched literally. */
export const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

/**
 * Guards table access: optional allow-list. Returns an error result or null.
 */
export function checkTable(config, table) {
  if (config.allowedTables && !config.allowedTables.has(table)) {
    return errorResult(
      `Table "${table}" is not permitted. Allowed tables: ${[...config.allowedTables].join(", ")}`
    );
  }
  return null;
}
