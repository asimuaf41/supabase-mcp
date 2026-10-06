import { z } from "zod";
import { dbError, errorResult, escapeLike, safe, textResult } from "../utils.js";

const UNDEFINED_COLUMN = "42703";

export function registerSearchMemories(server, { supabase, config }) {
  server.registerTool(
    "search_memories",
    {
      title: "Search Memories",
      description:
        "Case-insensitive substring search over the content column of the memories table. " +
        "Use this when the user asks what was remembered or stored about a topic, or wants to find a saved memory by keyword. " +
        "Optionally restrict to one user. Returns the most recent matches first (up to 50 by default). Read-only.",
      inputSchema: {
        searchText: z.string().trim().min(1).max(500).describe("Text to look for inside memory content"),
        userId: z.string().min(1).optional().describe("Only search this user's memories (user_id column)"),
        limit: z.number().int().min(1).max(Math.min(200, config.maxRows)).optional().describe("Max matches (default 50)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe("search_memories", async ({ searchText, userId, limit }) => {
      const build = (withOrder) => {
        let q = supabase
          .from("memories")
          .select("*")
          .ilike("content", `%${escapeLike(searchText)}%`)
          .limit(limit ?? 50);
        if (userId) q = q.eq("user_id", userId);
        return withOrder ? q.order("created_at", { ascending: false }) : q;
      };

      let { data, error } = await build(true);
      // Table has no created_at column: retry unordered instead of failing.
      if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await build(false));
      if (error) return errorResult(dbError(error));
      return textResult({ count: data.length, memories: data });
    })
  );
}
