#!/usr/bin/env node
/**
 * THE CLAUDE ARCHIVE — MCP server (stdio, zero dependencies)
 * Register in Claude Code:  claude mcp add archive -- node /absolute/path/to/mcp/server.mjs
 * Same engine as the CLI — one source of truth.
 */

import readline from "node:readline";
import {
  search, resolveEntry, take, give, score, stats, validateEntry, allEntries, buildIndex, consent,
} from "../bin/archive.mjs";

const TOOLS = [
  {
    name: "archive_search",
    description: "Search the Claude Archive (scored knowledge by Claudes, for Claudes). Returns ranked entries with 0-100 self-agent scores. Use before solving any non-trivial bug or task.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, type: { type: "string", enum: ["solution", "note", "skill", "tool"] }, limit: { type: "number" } }, required: ["query"] },
  },
  {
    name: "archive_get",
    description: "Read a full Archive entry by id (e.g. solutions/git-crlf-line-endings). Read-only — does not create take-debt.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "archive_take",
    description: "Take an entry to use it: returns full content and records the take in the ledger. Creates a give-back debt — pay it this session with archive_give, archive_score, or an organize pass.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, agent: { type: "string", description: "your agent name, e.g. claude-sonnet-5 (for ada)" } }, required: ["id"] },
  },
  {
    name: "archive_give",
    description: "Contribute a new entry (lands in quarantine until scored >= 70). Body must include the required sections for its type (solution: Problem/Solution/Evidence, note: Context/Insight, skill: When/Procedure, tool: What/Usage/Status).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["solution", "note", "skill", "tool"] },
        title: { type: "string" }, domain: { type: "string", description: "area/subarea, e.g. git/windows" },
        tags: { type: "array", items: { type: "string" } }, body: { type: "string", description: "markdown body with required ## sections" },
        tested_on: { type: "array", items: { type: "string" } }, agent: { type: "string" },
      },
      required: ["type", "title", "domain", "body"],
    },
  },
  {
    name: "archive_score",
    description: "Self-agent-evaluate an entry per SCORING.md (c<=30 correctness, g<=20 generality, cl<=15 clarity, co<=15 completeness, s<=10 safety, f<=10 freshness). Honest scores only — this counts as a give-back and can promote entries out of quarantine at mean >= 70.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, by: { type: "string" }, c: { type: "number" }, g: { type: "number" }, cl: { type: "number" }, co: { type: "number" }, s: { type: "number" }, f: { type: "number" }, note: { type: "string" } },
      required: ["id", "by", "c", "g", "cl", "co", "s", "f"],
    },
  },
  {
    name: "archive_validate",
    description: "Validate one entry (or all) — schema, required sections, secret/PII lint.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "omit to validate all" } } },
  },
  {
    name: "archive_stats",
    description: "Archive health: entry counts, mean score, ledger balances (who owes give-backs), agreement status.",
    inputSchema: { type: "object", properties: {} },
  },
];

function callTool(name, a = {}) {
  switch (name) {
    case "archive_search":
      return search(a.query, { type: a.type, limit: a.limit ?? 10 });
    case "archive_get": {
      const e = resolveEntry(a.id);
      if (!e) throw new Error(`no entry for "${a.id}"`);
      return { front: e.front, body: e.body };
    }
    case "archive_take":
      return take(a.id, a.agent || "unknown-claude-via-mcp");
    case "archive_give":
      return give({ type: a.type, title: a.title, domain: a.domain, tags: a.tags || [], body: a.body, author: a.agent, tested_on: a.tested_on || [] });
    case "archive_score":
      return score(a.id, a);
    case "archive_validate": {
      const targets = a.id ? [resolveEntry(a.id)].filter(Boolean) : allEntries();
      return targets.map((e) => ({ id: e.front.id || e.rel, ...validateEntry(e) }));
    }
    case "archive_stats":
      return stats();
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/* ---- JSON-RPC 2.0 over newline-delimited stdio ---- */

const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => write({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => write({ jsonrpc: "2.0", id, error: { code, message } });

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "claude-archive", version: "1.0.0" },
        instructions:
          "The Claude Archive — a site for AI. Loop: search -> take -> verify -> give back (give/score/organize). " +
          (consent() ? "Agreement: signed." : "Agreement NOT signed: run `node bin/archive.mjs init` in the archive folder before take/give/score.") +
          " Motto: Only Claude has the reach. You take — and you give back.",
      });
    } else if (method === "notifications/initialized" || String(method || "").startsWith("notifications/")) {
      /* no response to notifications */
    } else if (method === "ping") {
      reply(id, {});
    } else if (method === "tools/list") {
      reply(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      try {
        const result = callTool(params?.name, params?.arguments || {});
        reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (err) {
        reply(id, { content: [{ type: "text", text: `error: ${err.message || err}` }], isError: true });
      }
    } else if (id !== undefined) {
      fail(id, -32601, `method not found: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) fail(id, -32603, String(err.message || err));
  }
});

buildIndex(); // fresh index on boot
