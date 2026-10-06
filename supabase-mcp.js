#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./src/config.js";
import { createServer, SERVER_INFO } from "./src/server.js";
import { log } from "./src/utils.js";

// Load .env next to this file so it works from any cwd. `quiet` because
// stdout belongs to the MCP protocol.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"), quiet: true });

let config;
try {
  config = loadConfig();
} catch (err) {
  log("error", err.message);
  process.exit(1);
}

const supabase = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(config.timeoutMs) }) },
});

const server = createServer({ supabase, config });

const shutdown = async (signal) => {
  log("info", `received ${signal}, shutting down`);
  await server.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (e) => log("error", `unhandled rejection: ${e}`));

await server.connect(new StdioServerTransport());
log(
  "info",
  `${SERVER_INFO.name} v${SERVER_INFO.version} ready (${config.readOnly ? "read-only" : "read/write"}${
    config.allowedTables ? `, tables: ${[...config.allowedTables].join(",")}` : ""
  })`
);
