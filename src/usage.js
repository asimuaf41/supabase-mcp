const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round = (n, places = 6) => Number(n.toFixed(places));

// Tolerate common column-naming variants in usage_logs.
export const tokensOf = (r) =>
  num(r.total_tokens ?? r.tokens) ||
  num(r.input_tokens ?? r.prompt_tokens) + num(r.output_tokens ?? r.completion_tokens);

export const costOf = (r) => num(r.cost ?? r.total_cost ?? r.cost_usd);

/**
 * Pure aggregation over usage_logs rows. "Today" and "this month" are UTC.
 */
export function aggregateUsage(rows, now = new Date()) {
  const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

  const stats = {
    totalCalls: rows.length,
    totalTokens: 0,
    totalCost: 0,
    todayCost: 0,
    monthCost: 0,
    byAgentType: {},
  };

  for (const r of rows) {
    const tokens = tokensOf(r);
    const cost = costOf(r);
    stats.totalTokens += tokens;
    stats.totalCost += cost;

    const ts = r.created_at ? Date.parse(r.created_at) : NaN;
    if (ts >= startOfDay) stats.todayCost += cost;
    if (ts >= startOfMonth) stats.monthCost += cost;

    const key = r.agent_type ?? "unknown";
    const bucket = (stats.byAgentType[key] ??= { calls: 0, tokens: 0, cost: 0 });
    bucket.calls += 1;
    bucket.tokens += tokens;
    bucket.cost += cost;
  }

  stats.totalCost = round(stats.totalCost);
  stats.todayCost = round(stats.todayCost);
  stats.monthCost = round(stats.monthCost);
  for (const b of Object.values(stats.byAgentType)) b.cost = round(b.cost);
  return stats;
}
