import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetUsageStats } from "./tools/getUsageStats.js";
import { registerInsertRecord } from "./tools/insertRecord.js";
import { registerListTables } from "./tools/listTables.js";
import { registerQueryTable } from "./tools/queryTable.js";
import { registerSearchMemories } from "./tools/searchMemories.js";

export const SERVER_INFO = { name: "supabase-mcp", version: "1.0.0" };

/** Builds the MCP server. `supabase` and `config` are injected so it is testable. */
export function createServer({ supabase, config }) {
  const server = new McpServer(SERVER_INFO);
  const ctx = { supabase, config };
  registerQueryTable(server, ctx);
  registerListTables(server, ctx);
  registerGetUsageStats(server, ctx);
  registerSearchMemories(server, ctx);
  registerInsertRecord(server, ctx);
  return server;
}
