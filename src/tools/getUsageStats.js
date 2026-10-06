import { z } from "zod";
import { aggregateUsage } from "../usage.js";
import { dbError, errorResult, safe, textResult } from "../utils.js";

const PAGE = 1000;
const HARD_ROW_LIMIT = 100_000;

export function registerGetUsageStats(server, { supabase, config }) {
  server.registerTool(
    "get_usage_stats",
    {
      title: "Get Usage Stats",
      description:
        "Aggregate the usage_logs table: total calls, total tokens, total cost, today's cost, this month's cost, and a breakdown by agent_type. " +
        "Use this when the user asks about spend, token usage, API cost, or which agents are used most. " +
        "Optionally scope to one user and/or the last N days (totals and breakdown respect the filters; today/month cost are UTC calendar-based). Read-only.",
      inputSchema: {
        userId: z.string().min(1).optional().describe("Only include this user's rows (user_id column)"),
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .optional()
          .describe("Only include rows from the last N days; omit for all time"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe("get_usage_stats", async ({ userId, days }) => {
      const since = days ? new Date(Date.now() - days * 864e5).toISOString() : null;
      const rows = [];

      for (let from = 0; ; from += PAGE) {
        let q = supabase.from("usage_logs").select("*").order("created_at", { ascending: true });
        if (userId) q = q.eq("user_id", userId);
        if (since) q = q.gte("created_at", since);
        const { data, error } = await q.range(from, from + PAGE - 1);
        if (error) return errorResult(dbError(error));
        rows.push(...data);
        if (data.length < PAGE) break;
        if (rows.length >= HARD_ROW_LIMIT) {
          return errorResult(
            `usage_logs has more than ${HARD_ROW_LIMIT} matching rows; narrow the query with userId or days.`
          );
        }
      }

      return textResult({
        filters: { userId: userId ?? null, days: days ?? null },
        ...aggregateUsage(rows),
      });
    })
  );
}
