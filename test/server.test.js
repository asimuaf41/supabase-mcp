import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "../src/server.js";

/** Chainable fake of the supabase-js builder that resolves to `result`. */
function fakeSupabase(result, seen = []) {
  const builder = new Proxy({}, {
    get: (_, op) => {
      if (op === "then") return (res) => res(result);
      return (...args) => (seen.push([op, ...args]), builder);
    },
  });
  return { from: (t) => (seen.push(["from", t]), builder), seen };
}

const baseConfig = { url: "http://x", serviceRoleKey: "k", readOnly: false, allowedTables: null, maxRows: 1000, timeoutMs: 1000 };

async function connect(supabase, config = baseConfig) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createServer({ supabase, config }).connect(st);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(ct);
  return client;
}

test("registers all five tools with read/write annotations", async () => {
  const client = await connect(fakeSupabase({ data: [], error: null }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "get_usage_stats", "insert_record", "list_tables", "query_table", "search_memories",
  ]);
  assert.equal(tools.find((t) => t.name === "insert_record").annotations.readOnlyHint, false);
  assert.equal(tools.find((t) => t.name === "query_table").annotations.readOnlyHint, true);
});

test("query_table builds the expected query", async () => {
  const sb = fakeSupabase({ data: [{ id: 1 }], error: null });
  const client = await connect(sb);
  const r = await client.callTool({
    name: "query_table",
    arguments: { table: "users", filter: { id: 1 }, orderBy: "-id", limit: 10 },
  });
  assert.ok(!r.isError);
  assert.deepEqual(sb.seen.find((c) => c[0] === "range"), ["range", 0, 9]);
  assert.deepEqual(sb.seen.find((c) => c[0] === "order"), ["order", "id", { ascending: false }]);
});

test("query_table surfaces database errors without throwing", async () => {
  const client = await connect(fakeSupabase({ data: null, error: { message: "boom", code: "42P01" } }));
  const r = await client.callTool({ name: "query_table", arguments: { table: "nope" } });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /boom.*42P01/);
});

test("rejects unsafe identifiers", async () => {
  const client = await connect(fakeSupabase({ data: [], error: null }));
  const r = await client.callTool({ name: "query_table", arguments: { table: "a;drop table b" } }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
  assert.equal(r.isError, true);
});

test("insert_record is blocked in read-only mode and by allow-list", async () => {
  const ok = { data: [{ id: 1 }], error: null };
  let client = await connect(fakeSupabase(ok), { ...baseConfig, readOnly: true });
  let r = await client.callTool({ name: "insert_record", arguments: { table: "t", data: { a: 1 } } });
  assert.match(r.content[0].text, /read-only/);

  client = await connect(fakeSupabase(ok), { ...baseConfig, allowedTables: new Set(["only"]) });
  r = await client.callTool({ name: "insert_record", arguments: { table: "t", data: { a: 1 } } });
  assert.match(r.content[0].text, /not permitted/);
});

test("search_memories retries without ordering when created_at is missing", async () => {
  let n = 0;
  const seen = [];
  const sb = {
    from: () => new Proxy({}, {
      get: (_, op) => op === "then"
        ? (res) => res(++n === 1 ? { data: null, error: { code: "42703", message: "no col" } } : { data: [{ content: "hi" }], error: null })
        : (...a) => (seen.push(op), sb.from()),
    }),
  };
  const client = await connect(sb);
  const r = await client.callTool({ name: "search_memories", arguments: { searchText: "hi" } });
  assert.ok(!r.isError);
  assert.match(r.content[0].text, /"count": 1/);
});
