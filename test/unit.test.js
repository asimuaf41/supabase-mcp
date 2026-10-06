import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { applyFilters } from "../src/filters.js";
import { aggregateUsage } from "../src/usage.js";
import { escapeLike, textResult } from "../src/utils.js";

const recorder = () =>
  new Proxy({ calls: [] }, {
    get: (t, op) => (op === "calls" ? t.calls : (...a) => (t.calls.push([op, ...a]), proxy)),
  });
let proxy;

test("applyFilters maps values to the right operators", () => {
  proxy = recorder();
  applyFilters(proxy, { a: 1, b: null, c: [1, 2], d: { gte: 5, lt: 9 } });
  assert.deepEqual(proxy.calls, [
    ["eq", "a", 1],
    ["is", "b", null],
    ["in", "c", [1, 2]],
    ["gte", "d", 5],
    ["lt", "d", 9],
  ]);
});

test("aggregateUsage totals, periods and agent breakdown", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const rows = [
    { agent_type: "a", total_tokens: 10, cost: 0.5, created_at: "2026-10-15T01:00:00Z" },
    { agent_type: "a", input_tokens: 3, output_tokens: 2, cost: "0.25", created_at: "2026-10-02T01:00:00Z" },
    { agent_type: null, tokens: 7, cost_usd: 1, created_at: "2026-09-30T23:59:00Z" },
  ];
  const s = aggregateUsage(rows, now);
  assert.equal(s.totalCalls, 3);
  assert.equal(s.totalTokens, 22);
  assert.equal(s.totalCost, 1.75);
  assert.equal(s.todayCost, 0.5);
  assert.equal(s.monthCost, 0.75);
  assert.deepEqual(s.byAgentType.a, { calls: 2, tokens: 15, cost: 0.75 });
  assert.equal(s.byAgentType.unknown.calls, 1);
});

test("escapeLike neutralises wildcards", () => {
  assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
});

test("textResult truncates oversized payloads", () => {
  const r = textResult("x".repeat(200_000));
  assert.match(r.content[0].text, /truncated/);
});

test("loadConfig validates and normalises", () => {
  assert.throws(() => loadConfig({ SUPABASE_URL: "nope" }), /Invalid configuration/);
  const c = loadConfig({
    SUPABASE_URL: "https://x.supabase.co/",
    SUPABASE_SERVICE_ROLE_KEY: "k",
    SUPABASE_READ_ONLY: "true",
    SUPABASE_ALLOWED_TABLES: "a, b",
  });
  assert.equal(c.url, "https://x.supabase.co");
  assert.equal(c.readOnly, true);
  assert.deepEqual([...c.allowedTables], ["a", "b"]);
});
