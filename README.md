# supabase-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude Code direct, validated access to a Supabase (Postgres) database over stdio.

## Tools

| Tool | Type | Use it when… |
|---|---|---|
| `list_tables` | read | you need table/column names (cached 60 s) |
| `query_table` | read | you want rows from any table: select, filters (`eq`, `gt`, `in`, `ilike`…), order, limit, offset |
| `get_usage_stats` | read | the user asks about spend, tokens or agent usage (`usage_logs`) |
| `search_memories` | read | the user wants stored memories matching a keyword (`memories`) |
| `insert_record` | **write** | the user explicitly asks to add a row |

All inputs are validated with Zod. Identifiers are restricted to `[A-Za-z0-9_]`, tool failures return `isError` results (never unhandled exceptions), oversized responses are truncated, and each tool declares MCP annotations (`readOnlyHint`, etc.).

## Setup

```bash
npm install
cp .env.example .env     # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm test
```

### Register with Claude Code

```bash
claude mcp add supabase -s user -- node "/absolute/path/to/supabase-mcp/supabase-mcp.js"
claude mcp list
```

Or pass credentials inline instead of using `.env`:

```bash
claude mcp add supabase -s user \
  -e SUPABASE_URL=https://<ref>.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<key> \
  -- node "/absolute/path/to/supabase-mcp/supabase-mcp.js"
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | required | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | required | Service role key |
| `SUPABASE_READ_ONLY` | `false` | `true` disables `insert_record` |
| `SUPABASE_ALLOWED_TABLES` | all | Comma-separated allow-list |
| `SUPABASE_MAX_ROWS` | `1000` | Upper bound for `query_table` limit |
| `SUPABASE_TIMEOUT_MS` | `15000` | Per-request timeout |

## Security

The service role key **bypasses Row Level Security**. Keep `.env` out of version control (already in `.gitignore`), and for shared or client environments prefer `SUPABASE_READ_ONLY=true` plus `SUPABASE_ALLOWED_TABLES`.

## Expected schema

- `usage_logs`: `user_id`, `agent_type`, `created_at`, a cost column (`cost` / `total_cost` / `cost_usd`) and tokens (`total_tokens` / `tokens` / input + output tokens).
- `memories`: `content`, `user_id`, optionally `created_at` (used for newest-first ordering).

"Today" and "this month" in `get_usage_stats` are UTC calendar periods.

## Layout

```
supabase-mcp.js      entry point (env, client, stdio transport, shutdown)
src/server.js        server factory (dependency-injected, testable)
src/config.js        env validation
src/tools/*.js       one file per tool
src/{filters,usage,utils}.js
test/                unit + in-memory MCP integration tests (npm test)
```
