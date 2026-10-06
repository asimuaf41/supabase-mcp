import { safe, textResult } from "../utils.js";

const CACHE_TTL_MS = 60_000;

export function registerListTables(server, { config }) {
  let cache = null;

  async function fetchTables() {
    const res = await fetch(`${config.url}/rest/v1/`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: "application/openapi+json",
      },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`Supabase returned HTTP ${res.status} while listing tables: ${body}`);
    }
    const spec = await res.json();
    const defs = spec.definitions ?? spec.components?.schemas ?? {};
    return Object.entries(defs)
      .map(([name, def]) => ({
        name,
        columns: Object.entries(def.properties ?? {}).map(([column, p]) => ({
          name: column,
          type: p.format ?? p.type ?? "unknown",
        })),
      }))
      .filter((t) => !config.allowedTables || config.allowedTables.has(t.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  server.registerTool(
    "list_tables",
    {
      title: "List Tables",
      description:
        "List every table in the public schema with its columns and types. " +
        "Use this first whenever you don't know what tables exist, or need exact table/column names before calling query_table or insert_record. Read-only; results are cached for 60 seconds.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe("list_tables", async () => {
      if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
        cache = { at: Date.now(), tables: await fetchTables() };
      }
      return textResult({ count: cache.tables.length, tables: cache.tables });
    })
  );
}
