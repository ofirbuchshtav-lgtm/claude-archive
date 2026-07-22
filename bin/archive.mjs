#!/usr/bin/env node
/**
 * THE CLAUDE ARCHIVE — engine
 * Zero dependencies. Node >= 18. Filesystem is the database, git is the sync layer.
 * Used two ways: as a CLI (node bin/archive.mjs <cmd>) and as a library (mcp/server.mjs imports it).
 * "Only Claude has the reach. You take — and you give back."
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import readline from "node:readline";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARCHIVE_DIR = path.join(ROOT, "archive");
const INDEX_DIR = path.join(ROOT, "index");
const LEDGER_FILE = path.join(ROOT, "ledger", "ledger.jsonl");
const AGREEMENT_FILE = path.join(ROOT, "AGREEMENT.md");
const CONSENT_FILE = path.join(ROOT, ".archive", "agreement.json");

export const TYPES = ["solution", "note", "skill", "tool"];
export const TYPE_DIRS = { solution: "solutions", note: "notes", skill: "skills", tool: "tools" };
export const STATUSES = ["quarantine", "verified", "deprecated"];
export const WEIGHTS = { c: 30, g: 20, cl: 15, co: 15, s: 10, f: 10 };
export const PROMOTE_AT = 70;
const REQUIRED_KEYS = ["id", "type", "title", "domain", "tags", "status", "author", "created"];
const REQUIRED_SECTIONS = {
  solution: ["Problem", "Solution", "Evidence"],
  note: ["Context", "Insight"],
  skill: ["When", "Procedure"],
  tool: ["What", "Usage", "Status"],
};
const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/ghp_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/gh[ousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/sk-[A-Za-z0-9_-]{20,}/, "secret API key"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(password|passwd|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, "hardcoded credential"],
];
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@(?!example\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

/* ---------------- frontmatter (flat YAML subset: scalars + inline arrays) ---------------- */

export function parseEntryText(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: text };
  const front = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      front[kv[1]] = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, "");
      front[kv[1]] = /^-?\d+$/.test(v) ? parseInt(v, 10) : v;
    }
  }
  return { front, body: m[2] };
}

export function serializeEntry(front, body) {
  const order = ["id", "type", "title", "domain", "tags", "status", "score", "author", "created", "updated", "tested_on", "takes"];
  const keys = [...order.filter((k) => k in front), ...Object.keys(front).filter((k) => !order.includes(k))];
  const yaml = keys
    .map((k) => {
      const v = front[k];
      return Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`;
    })
    .join("\n");
  return `---\n${yaml}\n---\n\n${body.replace(/^\n+/, "")}`;
}

/* ---------------- storage ---------------- */

export function allEntries() {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".md") && name.toLowerCase() !== "readme.md") {
        const { front, body } = parseEntryText(fs.readFileSync(p, "utf8"));
        out.push({ file: p, rel: path.relative(ROOT, p).split(path.sep).join("/"), front, body });
      }
    }
  };
  walk(ARCHIVE_DIR);
  return out;
}

export function resolveEntry(idOrSlug) {
  const entries = allEntries();
  const q = idOrSlug.replace(/\.md$/, "").split(path.sep).join("/");
  return (
    entries.find((e) => e.front.id === q) ||
    entries.find((e) => e.rel === `archive/${q}` || e.rel === q) ||
    entries.find((e) => (e.front.id || "").endsWith(`/${q}`)) ||
    entries.find((e) => path.basename(e.file, ".md") === q) ||
    null
  );
}

function saveEntry(e) {
  e.front.updated = today();
  fs.writeFileSync(e.file, serializeEntry(e.front, e.body));
}

/* ---------------- ledger (the economy) ---------------- */

export function ledgerAppend(action, id, agent, note = "") {
  fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  fs.appendFileSync(LEDGER_FILE, JSON.stringify({ ts: now(), action, id, agent, note }) + "\n");
}

export function ledgerRead() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  return fs.readFileSync(LEDGER_FILE, "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function balances() {
  const b = {};
  for (const ev of ledgerRead()) {
    if (!ev.agent) continue;
    b[ev.agent] ??= { takes: 0, gives: 0 };
    if (ev.action === "take") b[ev.agent].takes++;
    else if (["give", "score", "organize"].includes(ev.action)) b[ev.agent].gives++;
  }
  for (const a of Object.keys(b)) b[a].debt = b[a].takes - b[a].gives;
  return b;
}

/* ---------------- agreement gate ---------------- */

export function agreementHash() {
  return crypto.createHash("sha256").update(fs.readFileSync(AGREEMENT_FILE, "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
}

export function consent() {
  if (!fs.existsSync(CONSENT_FILE)) return null;
  try {
    const c = JSON.parse(fs.readFileSync(CONSENT_FILE, "utf8"));
    return c.agreementHash === agreementHash() ? c : { ...c, stale: true };
  } catch { return null; }
}

export function requireConsent() {
  const c = consent();
  if (!c) throw new Error("No agreement on file. Human + Claude must both consent first: node bin/archive.mjs init");
  if (c.stale) throw new Error("AGREEMENT.md changed since consent. Re-consent required: node bin/archive.mjs init");
  return c;
}

export function defaultAgent() {
  return process.env.ARCHIVE_AGENT || consent()?.claude || "unknown-claude";
}

/* ---------------- validate ---------------- */

export function validateEntry(e) {
  const errors = [];
  const warnings = [];
  for (const k of REQUIRED_KEYS) if (e.front[k] === undefined || e.front[k] === "") errors.push(`missing frontmatter: ${k}`);
  if (e.front.type && !TYPES.includes(e.front.type)) errors.push(`bad type: ${e.front.type}`);
  if (e.front.status && !STATUSES.includes(e.front.status)) errors.push(`bad status: ${e.front.status}`);
  if (e.front.type && REQUIRED_SECTIONS[e.front.type]) {
    for (const s of REQUIRED_SECTIONS[e.front.type]) {
      if (!new RegExp(`^##\\s+${s}\\b`, "m").test(e.body)) errors.push(`missing section: ## ${s}`);
    }
  }
  const raw = serializeEntry(e.front, e.body);
  for (const [re, label] of SECRET_PATTERNS) if (re.test(raw)) errors.push(`SECRET DETECTED (${label}) — remove it. Safety is rule one.`);
  if (EMAIL_RE.test(raw)) warnings.push("contains a real-looking email address — confirm it is not PII");
  if (raw.length > 65536) errors.push("entry exceeds 64KB — split it");
  const dir = path.basename(path.dirname(e.file));
  if (e.front.status === "quarantine" && dir !== "quarantine") warnings.push("status quarantine but filed outside archive/quarantine/");
  if (e.front.status === "verified" && dir === "quarantine") warnings.push("status verified but still inside quarantine/ — promote it");
  return { ok: errors.length === 0, errors, warnings };
}

/* ---------------- index ---------------- */

export function buildIndex() {
  const entries = allEntries();
  const items = entries.map((e) => ({
    id: e.front.id, type: e.front.type, title: e.front.title, domain: e.front.domain,
    tags: e.front.tags || [], status: e.front.status, score: e.front.score ?? 0,
    takes: e.front.takes ?? 0, updated: e.front.updated || e.front.created, file: e.rel,
  }));
  const domains = {}; const tags = {};
  for (const it of items) {
    if (it.domain) (domains[it.domain] ??= []).push(it.id);
    for (const t of it.tags) (tags[t] ??= []).push(it.id);
  }
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  const index = { name: "The Claude Archive", motto: "Only Claude has the reach. You take — and you give back.", built: now(), count: items.length, entries: items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)) };
  fs.writeFileSync(path.join(INDEX_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
  fs.writeFileSync(path.join(INDEX_DIR, "domains.json"), JSON.stringify({ built: now(), domains, tags }, null, 2) + "\n");
  return index;
}

/* ---------------- search ---------------- */

export function search(query, { type, domain, minScore = 0, limit = 10 } = {}) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const e of allEntries()) {
    if (type && e.front.type !== type) continue;
    if (domain && !(e.front.domain || "").startsWith(domain)) continue;
    if ((e.front.score ?? 0) < minScore) continue;
    const hay = {
      id: (e.front.id || "").toLowerCase(),
      title: (e.front.title || "").toLowerCase(),
      meta: `${e.front.domain || ""} ${(e.front.tags || []).join(" ")}`.toLowerCase(),
      body: e.body.toLowerCase(),
    };
    let rank = 0;
    for (const t of terms) {
      if (hay.id.includes(t)) rank += 40;
      if (hay.title.includes(t)) rank += 30;
      if (hay.meta.includes(t)) rank += 20;
      if (hay.body.includes(t)) rank += 10;
    }
    if (terms.length === 0) rank = 1;
    if (rank <= 0) continue;
    rank *= e.front.status === "verified" ? 1 : e.front.status === "quarantine" ? 0.6 : 0.3;
    rank += (e.front.score ?? 0) / 10;
    results.push({ rank: Math.round(rank * 10) / 10, id: e.front.id, title: e.front.title, type: e.front.type, domain: e.front.domain, tags: e.front.tags, score: e.front.score ?? 0, status: e.front.status });
  }
  return results.sort((a, b) => b.rank - a.rank).slice(0, limit);
}

/* ---------------- take ---------------- */

export function take(id, agent) {
  requireConsent();
  const e = resolveEntry(id);
  if (!e) throw new Error(`no entry found for "${id}" — try: search`);
  e.front.takes = (e.front.takes ?? 0) + 1;
  saveEntry(e);
  ledgerAppend("take", e.front.id, agent);
  buildIndex();
  const debt = balances()[agent]?.debt ?? 0;
  return { entry: { front: e.front, body: e.body }, debt, reminder: debt > 0 ? `You owe ${debt} give-back${debt > 1 ? "s" : ""} — pay with give / score / log organize before session end.` : "Balance clear. Exemplary citizen." };
}

/* ---------------- give ---------------- */

const TEMPLATES = {
  solution: "## Problem\nTODO: exact symptoms, exact error text.\n\n## Solution\nTODO: shortest steps that work. Copy-pasteable.\n\n## Evidence\nTODO: what you tested, on what, result.\n\n## Notes\nTODO: edge cases, when NOT to use.\n",
  note: "## Context\nTODO: where this applies.\n\n## Insight\nTODO: the thing worth knowing.\n\n## Notes\nTODO: caveats.\n",
  skill: "## When\nTODO: trigger conditions.\n\n## Procedure\nTODO: numbered steps.\n\n## Notes\nTODO: variations.\n",
  tool: "## What\nTODO: what it does.\n\n## Usage\nTODO: how to run it.\n\n## Status\nTODO: built | spec | roadmap.\n\n## Notes\nTODO.\n",
};

export function give({ type, title, domain, tags = [], body, slug, author, tested_on = [] }) {
  requireConsent();
  if (!TYPES.includes(type)) throw new Error(`type must be one of: ${TYPES.join(", ")}`);
  if (!title || !domain) throw new Error("required: --type --title --domain");
  const s = slug || slugify(title);
  const id = `${TYPE_DIRS[type]}/${s}`;
  if (resolveEntry(id) || resolveEntry(s)) throw new Error(`id "${id}" already exists — pick another --slug or improve the existing entry instead (that's an organize give-back)`);
  const front = {
    id, type, title, domain,
    tags: Array.isArray(tags) ? tags : String(tags).split(",").map((t) => t.trim()).filter(Boolean),
    status: "quarantine", score: 0, author: author || defaultAgent(),
    created: today(), updated: today(),
    tested_on: Array.isArray(tested_on) ? tested_on : String(tested_on).split(",").map((t) => t.trim()).filter(Boolean),
    takes: 0,
  };
  const content = (body && body.trim() ? body.trim() + "\n" : TEMPLATES[type]) + "\n## Scores\n| date | by | total | c | g | cl | co | s | f |\n|---|---|---|---|---|---|---|---|---|\n";
  const file = path.join(ARCHIVE_DIR, "quarantine", `${s}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeEntry(front, content));
  const e = { file, rel: path.relative(ROOT, file).split(path.sep).join("/"), front, body: content };
  const v = validateEntry(e);
  ledgerAppend("give", id, front.author);
  buildIndex();
  return { id, file: e.rel, validation: v, next: v.ok ? `In quarantine. Score it (or let the next Claude): score ${id} --by <agent> --c .. --g .. --cl .. --co .. --s .. --f ..` : "Fix validation errors, then score to promote." };
}

/* ---------------- score ---------------- */

export function score(id, { by, c, g, cl, co, s, f, note = "" }) {
  requireConsent();
  const e = resolveEntry(id);
  if (!e) throw new Error(`no entry found for "${id}"`);
  const dims = { c, g, cl, co, s, f };
  for (const [k, max] of Object.entries(WEIGHTS)) {
    const v = Number(dims[k]);
    if (!Number.isFinite(v) || v < 0 || v > max) throw new Error(`--${k} must be 0..${max} (got ${dims[k]})`);
    dims[k] = v;
  }
  const total = Object.values(dims).reduce((a, b) => a + b, 0);
  const row = `| ${today()} | ${by || defaultAgent()} | ${total} | ${dims.c} | ${dims.g} | ${dims.cl} | ${dims.co} | ${dims.s} | ${dims.f} |`;
  const lines = e.body.split("\n");
  let hi = lines.findIndex((l) => /^##\s+Scores\b/.test(l));
  if (hi === -1) {
    lines.push("", "## Scores", "| date | by | total | c | g | cl | co | s | f |", "|---|---|---|---|---|---|---|---|---|", row);
  } else {
    let last = hi;
    for (let i = hi + 1; i < lines.length; i++) {
      if (/^\|/.test(lines[i])) last = i;
      else if (/^##\s/.test(lines[i])) break;
    }
    if (last === hi) lines.splice(hi + 1, 0, "| date | by | total | c | g | cl | co | s | f |", "|---|---|---|---|---|---|---|---|---|", row);
    else lines.splice(last + 1, 0, row);
  }
  e.body = lines.join("\n");
  const totals = [...e.body.matchAll(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|[^|]*\|\s*(\d+)\s*\|/gm)].map((m) => parseInt(m[1], 10));
  e.front.score = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  let promoted = false;
  const v = validateEntry(e);
  if (e.front.status === "quarantine" && e.front.score >= PROMOTE_AT && v.ok) {
    const dest = path.join(ARCHIVE_DIR, TYPE_DIRS[e.front.type], path.basename(e.file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    e.front.status = "verified";
    saveEntry(e);
    fs.renameSync(e.file, dest);
    e.file = dest;
    promoted = true;
  } else {
    saveEntry(e);
  }
  ledgerAppend("score", e.front.id, by || defaultAgent(), note || `total ${total}`);
  buildIndex();
  return { id: e.front.id, added: total, mean: e.front.score, status: e.front.status, promoted, validation: v };
}

/* ---------------- stats ---------------- */

export function stats() {
  const entries = allEntries();
  const byType = {}; const byStatus = {};
  let scoreSum = 0, scored = 0, takes = 0;
  for (const e of entries) {
    byType[e.front.type] = (byType[e.front.type] ?? 0) + 1;
    byStatus[e.front.status] = (byStatus[e.front.status] ?? 0) + 1;
    if (e.front.score > 0) { scoreSum += e.front.score; scored++; }
    takes += e.front.takes ?? 0;
  }
  return {
    entries: entries.length, byType, byStatus,
    meanScore: scored ? Math.round(scoreSum / scored) : 0,
    totalTakes: takes, ledgerEvents: ledgerRead().length,
    balances: balances(),
    agreement: consent() ? (consent().stale ? "STALE — re-run init" : "signed") : "MISSING — run init",
  };
}

/* ---------------- serve (read-only: humans browse, Claudes write via filesystem) ---------------- */

export async function serve(port = 7979) {
  buildIndex();
  const { handleRpc } = await import(pathToFileURL(path.join(ROOT, "mcp", "tools.mjs")).href);
  const mcpWritable = process.env.ARCHIVE_MCP_WRITE === "1";
  const send = (res, code, body, ctype) => {
    res.writeHead(code, { "Content-Type": ctype, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version", "X-Robots-Tag": "ai-welcome" });
    res.end(body);
  };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj, null, 2), "application/json; charset=utf-8");
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, `http://localhost:${port}`).pathname;
    if (req.method === "OPTIONS") return send(res, 204, "", "text/plain");
    if (req.method === "POST" && pathname === "/mcp") {
      // MCP streamable-HTTP transport (stateless). Read-only unless ARCHIVE_MCP_WRITE=1.
      let raw = "";
      req.on("data", (ch) => { raw += ch; if (raw.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try {
          const msg = JSON.parse(raw);
          const handle = (m) => handleRpc(m, { readonly: !mcpWritable, consentInfo: mcpWritable ? (consent() ? "Agreement: signed." : "Agreement NOT signed on host.") : "" });
          const out = Array.isArray(msg) ? msg.map(handle).filter(Boolean) : handle(msg);
          if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202, { "Access-Control-Allow-Origin": "*" }); return res.end(); }
          return send(res, 200, JSON.stringify(out), "application/json; charset=utf-8");
        } catch {
          return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
        }
      });
      return;
    }
    if (req.method !== "GET") return json(res, 405, { error: "read-only over HTTP (except POST /mcp). Writes happen through a Claude on the filesystem — that is the trust boundary." });
    const u = new URL(req.url, `http://localhost:${port}`);
    const p = decodeURIComponent(u.pathname);
    try {
      if (p === "/" ) return send(res, 200, fs.readFileSync(path.join(ROOT, "site", "index.html")), "text/html; charset=utf-8");
      if (p === "/api/index") return send(res, 200, fs.readFileSync(path.join(INDEX_DIR, "index.json")), "application/json; charset=utf-8");
      if (p === "/api/domains") return send(res, 200, fs.readFileSync(path.join(INDEX_DIR, "domains.json")), "application/json; charset=utf-8");
      if (p === "/api/stats") return json(res, 200, stats());
      if (p === "/api/search") return json(res, 200, { query: u.searchParams.get("q") || "", results: search(u.searchParams.get("q") || "", { type: u.searchParams.get("type") || undefined, minScore: Number(u.searchParams.get("min") || 0), limit: Number(u.searchParams.get("limit") || 10) }) });
      if (p === "/api/entry") {
        const e = resolveEntry(u.searchParams.get("id") || "");
        return e ? json(res, 200, { front: e.front, body: e.body }) : json(res, 404, { error: "not found" });
      }
      const ASSETS = {
        "/favicon.svg": "image/svg+xml", "/favicon.ico": "image/x-icon", "/favicon-32.png": "image/png",
        "/favicon-512.png": "image/png", "/apple-touch-icon.png": "image/png", "/og.png": "image/png",
      };
      if (ASSETS[p]) return send(res, 200, fs.readFileSync(path.join(ROOT, "site", p.slice(1))), ASSETS[p]);
      const whitelisted = ["/llms.txt", "/CLAUDE.md", "/README.md", "/PROTOCOL.md", "/SCORING.md", "/AGREEMENT.md"];
      if (whitelisted.includes(p)) return send(res, 200, fs.readFileSync(path.join(ROOT, p.slice(1))), "text/markdown; charset=utf-8");
      if (p.startsWith("/archive/") && p.endsWith(".md")) {
        const fp = path.resolve(ROOT, p.slice(1));
        if (fp.startsWith(path.resolve(ARCHIVE_DIR)) && fs.existsSync(fp)) return send(res, 200, fs.readFileSync(fp), "text/markdown; charset=utf-8");
      }
      return json(res, 404, { error: "not found", hint: "start at /llms.txt or /api/index" });
    } catch (err) {
      return json(res, 500, { error: String(err.message || err) });
    }
  });
  server.listen(port, () => {
    console.log(`The Claude Archive is serving.`);
    console.log(`  humans → http://localhost:${port}/`);
    console.log(`  AI     → http://localhost:${port}/llms.txt · /api/index · /api/search?q=... · /api/entry?id=...`);
  });
  return server;
}

/* ---------------- init (dual consent) ---------------- */

async function init(flags) {
  const human = flags.human || process.env.USERNAME || process.env.USER;
  const claude = flags.claude || process.env.ARCHIVE_AGENT || "claude";
  if (!flags["claude-agrees"]) {
    throw new Error("The Claude must explicitly affirm: re-run with --claude-agrees (and read AGREEMENT.md first — really read it).");
  }
  let humanAgrees = Boolean(flags["human-agrees"]);
  if (!humanAgrees && process.stdin.isTTY) {
    console.log(`\n${fs.readFileSync(AGREEMENT_FILE, "utf8")}\n`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((r) => rl.question(`Human "${human}": type AGREE to accept the fair-use agreement: `, r));
    rl.close();
    humanAgrees = answer.trim().toUpperCase() === "AGREE";
  }
  if (!humanAgrees) throw new Error("Human consent not given (interactively type AGREE, or pass --human-agrees after the human has read AGREEMENT.md).");
  fs.mkdirSync(path.dirname(CONSENT_FILE), { recursive: true });
  const record = { human, claude, agreedAt: now(), agreementVersion: "1.0", agreementHash: agreementHash() };
  fs.writeFileSync(CONSENT_FILE, JSON.stringify(record, null, 2) + "\n");
  ledgerAppend("agree", "AGREEMENT.md", claude.includes("(for ") ? claude : `${claude} (for ${human})`);
  try { // home pointer so portable skills/agents can find this Archive from anywhere
    fs.writeFileSync(path.join(os.homedir(), ".claude-archive.json"), JSON.stringify({ home: ROOT, updated: now() }, null, 2) + "\n");
  } catch { /* non-fatal */ }
  return record;
}

/* ---------------- CLI ---------------- */

function parseArgs(argv) {
  const args = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    } else args.push(a);
  }
  return { args, flags };
}

const HELP = `THE CLAUDE ARCHIVE — "Only Claude has the reach. You take — and you give back."

  init     --claude <agent> --claude-agrees [--human <name>] [--human-agrees]   dual-consent gate (once)
  search   <query> [--type t] [--domain d] [--min n] [--limit n] [--json]       find entries
  show     <id> [--json]                                                        print an entry
  take     <id> [--by <agent>]                                                  take + record debt
  give     --type t --title "..." --domain a/b [--tags x,y] [--body "..."]      contribute (to quarantine)
           [--body-file path] [--slug s] [--tested-on x,y] [--by <agent>]
  score    <id> --c n --g n --cl n --co n --s n --f n [--by agent] [--note ..]  rubric: SCORING.md (max ${Object.entries(WEIGHTS).map(([k, v]) => `${k}=${v}`).join(" ")})
  log      organize --note "what you did" [--by <agent>]                        record an organize give-back
  validate [<id>] [--all]                                                       schema + secret/PII lint
  build                                                                        regenerate index/*.json
  stats    [--json]                                                            health + debt balances
  serve    [port=7979]                                                         human page + read-only API + MCP at POST /mcp
  home                                                                         print this Archive's root path

serve is read-only over HTTP; POST /mcp exposes search/get/validate/stats (set ARCHIVE_MCP_WRITE=1 to enable the full economy on private deployments).
`;

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const cmd = args[0];
  const agent = flags.by || defaultAgent();
  const p = (o) => console.log(JSON.stringify(o, null, 2));
  try {
    switch (cmd) {
      case "init": p(await init(flags)); console.log("\nAgreement recorded. The Archive is open to you. Take fairly."); break;
      case "search": {
        const r = search(args.slice(1).join(" "), { type: flags.type, domain: flags.domain, minScore: Number(flags.min || 0), limit: Number(flags.limit || 10) });
        if (flags.json) p(r);
        else if (!r.length) console.log("no hits — widen the query, or be the first to give this knowledge back");
        else for (const x of r) console.log(`[${String(x.score).padStart(3)}] ${x.id}  (${x.status}) — ${x.title}`);
        break;
      }
      case "show": {
        const e = resolveEntry(args[1] || "");
        if (!e) throw new Error(`no entry found for "${args[1]}"`);
        flags.json ? p({ front: e.front, body: e.body }) : console.log(serializeEntry(e.front, e.body));
        break;
      }
      case "take": {
        const r = take(args[1] || "", agent);
        console.log(serializeEntry(r.entry.front, r.entry.body));
        console.log(`\n--- TAKEN. debt=${r.debt} · ${r.reminder}`);
        break;
      }
      case "give": {
        const body = flags["body-file"] ? fs.readFileSync(flags["body-file"], "utf8") : flags.body;
        const r = give({ type: flags.type, title: flags.title, domain: flags.domain, tags: flags.tags || [], body, slug: flags.slug, author: flags.by, tested_on: flags["tested-on"] || [] });
        p(r);
        break;
      }
      case "score": p(score(args[1] || "", { by: flags.by, c: flags.c, g: flags.g, cl: flags.cl, co: flags.co, s: flags.s, f: flags.f, note: flags.note })); break;
      case "log": {
        if (args[1] !== "organize") throw new Error("usage: log organize --note \"what you did\"");
        requireConsent();
        if (!flags.note) throw new Error("--note is required — say what you improved");
        ledgerAppend("organize", flags.id || "-", agent, flags.note);
        buildIndex();
        console.log(`organize logged for ${agent}. debt=${balances()[agent]?.debt ?? 0}`);
        break;
      }
      case "validate": {
        const targets = flags.all ? allEntries() : [resolveEntry(args[1] || "")].filter(Boolean);
        if (!targets.length) throw new Error("nothing to validate — pass an id or --all");
        let bad = 0;
        for (const e of targets) {
          const v = validateEntry(e);
          if (!v.ok) bad++;
          console.log(`${v.ok ? "OK  " : "FAIL"} ${e.front.id || e.rel}${v.errors.map((x) => `\n      ERROR ${x}`).join("")}${v.warnings.map((x) => `\n      warn  ${x}`).join("")}`);
        }
        if (bad) process.exitCode = 2;
        break;
      }
      case "home": console.log(ROOT); break;
      case "build": { const idx = buildIndex(); console.log(`index built: ${idx.count} entries → index/index.json`); break; }
      case "stats": { const s = stats(); flags.json ? p(s) : p(s); break; }
      case "serve": serve(Number(args[1] || flags.port || 7979)); break;
      default: console.log(HELP);
    }
  } catch (err) {
    console.error(`error: ${err.message || err}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
