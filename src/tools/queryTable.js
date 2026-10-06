import { z } from "zod";
import { applyFilters, filterSchema } from "../filters.js";
import { checkTable, dbError, errorResult, identifier, safe, textResult } from "../utils.js";

const SELECT_PATTERN = /^[A-Za-z0-9_,*:()!.\s-]+$/;

export function registerQueryTable(server, { supabase, config }) {
  server.registerTool(
    "query_table",
    {
      title: "Query Table",
      description:
        "Read rows from any Supabase table with optional column selection, filters, ordering, limit and offset. " +
        "Use this when the user asks to look at, inspect, count, or fetch data from a specific table and neither get_usage_stats nor search_memories fits. " +
        "If you are unsure of table or column names, call list_tables first. " +
        "Filters: a plain value means equals; an array means IN; null means IS NULL; an object uses operators " +
        'eq, neq, gt, gte, lt, lte, like, ilike, in, is (e.g. {"created_at": {"gte": "2025-01-01"}}). Read-only.',
      inputSchema: {
        table: identifier("table name").describe("Table name in the public schema"),
        select: z
          .string()
          .regex(SELECT_PATTERN, "Invalid select expression")
          .optional()
          .describe('Columns to return in PostgREST syntax, e.g. "id,name". Defaults to "*"'),
        filter: filterSchema.optional().describe('Filters, e.g. {"user_id": "abc", "status": ["a","b"]}'),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(`Max rows to return (default 50, capped at ${config.maxRows})`),
        offset: z.number().int().min(0).optional().describe("Rows to skip, for pagination"),
        orderBy: z
          .string()
          .regex(/^-?[A-Za-z_][A-Za-z0-9_]*$/, "Invalid orderBy column")
          .optional()
          .describe('Column to sort by; prefix with "-" for descending, e.g. "-created_at"'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe("query_table", async ({ table, select, filter, limit, offset, orderBy }) => {
      const denied = checkTable(config, table);
      if (denied) return denied;

      const pageSize = Math.min(limit ?? 50, config.maxRows);
      const from = offset ?? 0;

      let q = supabase.from(table).select(select || "*");
      q = applyFilters(q, filter);
      if (orderBy) {
        const desc = orderBy.startsWith("-");
        q = q.order(desc ? orderBy.slice(1) : orderBy, { ascending: !desc });
      }
      q = q.range(from, from + pageSize - 1);

      const { data, error } = await q;
      if (error) return errorResult(dbError(error));
      return textResult({
        table,
        returned: data.length,
        offset: from,
        hasMore: data.length === pageSize,
        rows: data,
      });
    })
  );
}
