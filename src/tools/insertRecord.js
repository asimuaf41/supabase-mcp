import { z } from "zod";
import { checkTable, dbError, errorResult, identifier, safe, textResult } from "../utils.js";

export function registerInsertRecord(server, { supabase, config }) {
  server.registerTool(
    "insert_record",
    {
      title: "Insert Record",
      description:
        "Insert ONE new row into a Supabase table and return the created row. This WRITES to the database: " +
        "use it only when the user explicitly asks to add, create or save data. Verify column names with list_tables first. " +
        "Never use it to read or modify existing rows. Disabled when the server runs with SUPABASE_READ_ONLY=true.",
      inputSchema: {
        table: identifier("table name").describe("Table name in the public schema"),
        data: z
          .record(identifier("column name"), z.unknown())
          .refine((d) => Object.keys(d).length > 0, "data must contain at least one column")
          .describe("Column/value pairs for the new row"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    safe("insert_record", async ({ table, data }) => {
      if (config.readOnly) {
        return errorResult("Server is in read-only mode (SUPABASE_READ_ONLY=true); inserts are disabled.");
      }
      const denied = checkTable(config, table);
      if (denied) return denied;

      const { data: inserted, error } = await supabase.from(table).insert(data).select();
      if (error) return errorResult(dbError(error));
      return textResult({ table, inserted });
    })
  );
}
