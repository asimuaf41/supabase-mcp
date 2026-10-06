import { z } from "zod";
import { identifier } from "./utils.js";

const scalar = z.union([z.string(), z.number(), z.boolean()]);

const operators = z
  .object({
    eq: scalar,
    neq: scalar,
    gt: scalar,
    gte: scalar,
    lt: scalar,
    lte: scalar,
    like: z.string(),
    ilike: z.string(),
    in: z.array(z.union([z.string(), z.number()])),
    is: z.null(),
  })
  .partial()
  .strict();

export const filterSchema = z.record(
  identifier("column name"),
  z.union([scalar, z.null(), z.array(z.union([z.string(), z.number()])), operators])
);

/**
 * Applies a filter object to a supabase-js query builder.
 *   scalar -> eq, null -> IS NULL, array -> IN, {op: value} -> that operator.
 */
export function applyFilters(query, filter = {}) {
  let q = query;
  for (const [col, val] of Object.entries(filter)) {
    if (val === null) q = q.is(col, null);
    else if (Array.isArray(val)) q = q.in(col, val);
    else if (typeof val === "object") {
      for (const [op, v] of Object.entries(val)) q = q[op](col, v);
    } else q = q.eq(col, val);
  }
  return q;
}
