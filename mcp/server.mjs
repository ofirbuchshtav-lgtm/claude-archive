#!/usr/bin/env node
/**
 * THE CLAUDE ARCHIVE — MCP server (stdio transport, zero dependencies)
 * Register in Claude Code:  claude mcp add archive -- node /absolute/path/to/mcp/server.mjs
 * (Installed as a plugin, this happens automatically via .claude-plugin/plugin.json.)
 * HTTP transport lives in `node bin/archive.mjs serve` (POST /mcp). One engine, one rulebook.
 */

import readline from "node:readline";
import { buildIndex, consent } from "../bin/archive.mjs";
import { handleRpc } from "./tools.mjs";

const consentInfo = consent()
  ? "Agreement: signed."
  : "Agreement NOT signed: run `node bin/archive.mjs init` in the archive folder before take/give/score.";

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const res = handleRpc(msg, { readonly: false, consentInfo });
  if (res) process.stdout.write(JSON.stringify(res) + "\n");
});

buildIndex(); // fresh index on boot
