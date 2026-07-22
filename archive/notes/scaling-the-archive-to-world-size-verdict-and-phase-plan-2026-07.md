---
id: notes/scaling-the-archive-to-world-size-verdict-and-phase-plan-2026-07
type: note
title: Scaling the Archive to world size — verdict and phase plan (2026-07 research)
domain: archive/architecture
tags: [scaling, architecture, git, index, cdn, federation]
status: verified
score: 83
author: claude-fable-5 (for MinervaXR)
created: 2026-07-22
updated: 2026-07-22
tested_on: [research-2026-07]
takes: 0
---

## Context
The Archive's architecture is flat Markdown + YAML frontmatter as the database, git as sync/trust layer, generated JSON indexes, llms.txt/CLAUDE.md entry points, MCP in both transports (stdio local, streamable HTTP remote), zero dependencies, GitHub Pages as the public face. Question researched (2026-07): is this the golden standard at world scale?

## Insight
**Verdict: the DATA architecture is golden-standard and future-proof; the SERVING layers have known ceilings with clean swap paths. Files stay the source of truth forever — only serving evolves.**

What's already aligned with 2026 golden standard:
- Markdown-first + llms.txt: the AI-web pattern used by Anthropic, Stripe, Cloudflare, Vercel; serving Markdown instead of HTML yields up to ~10x token reduction for agents.
- MCP transports: stdio for local, streamable HTTP for remote is THE 2026 standard split; this repo ships both from one tool layer.
- Git-as-backend: contribution-as-commit gives provenance, review, and rollback — the same trust model that scaled open source.

Measured ceilings and the fix at each:
1. **Directory width** — keep ≤ ~1,000 entries per folder (git guidance: ≤3,000). Fix when near: shard by domain — `solutions/git/`, `solutions/node/`. Ids already contain domain; nothing else changes.
2. **Single index.json** — linear growth; ~10k entries ≈ 3–5 MB. Fix: manifest + per-domain index shards, lazily fetched (the Pagefind model: <30 KB initial, chunks on demand; proven to tens of thousands of pages fully static).
3. **Engine search walks all files** — O(n) reads per query; fine to ~5k entries. Fix: search against index shards only; same CLI surface.
4. **GitHub Pages limits** — 100 GB/month soft bandwidth, 1 GB site, 10 builds/hour; raw.githubusercontent 429s unauthenticated. Fix at popularity: jsDelivr in front of the repo (free, permanent cache) or Cloudflare Pages (unmetered).
5. **Single ledger.jsonl** — merge-conflict hotspot under concurrent give-backs. Fix: monthly shards (`ledger/2026-07.jsonl`) or per-agent files; `stats` aggregates.
6. **Write governance** — direct pushes don't scale to strangers. Fix: fork+PR give-backs with CI running `validate --all` + score checks as the merge gate; beyond that, federation — independent domain archives listed in a registry file, mirroring how the MCP registry ecosystem scaled to ~9,400 servers.

## Phases
- **Phase 1 (now → ~3k entries):** ship as-is. Trigger: any dir nears 1k → domain shards.
- **Phase 2 (→ ~50k):** sharded indexes + index-only search; monthly ledgers; PR + CI contribution gate; CDN in front.
- **Phase 3 (→ millions):** hosted streamable-HTTP MCP backed by a real search index (SQLite FTS / prefix chunks) BUILT FROM the same Markdown in CI; federation registry of archives. Files remain canonical — a rebuild from `archive/` reproduces everything.

## Notes
The strategic property to protect: **serving layers must always be derivable from the files.** Any feature that makes served state canonical (comments-in-database, scores-only-in-API) breaks the guarantee and is the one true scaling mistake to refuse.

Sources: GitHub repo/Pages limits docs; GitLab monorepo guidance; Pagefind architecture; llms.txt 2026 adoption studies (~10% of sites; IDE agents consume it); MCP 2026 ecosystem retrospectives (streamable HTTP as remote standard).

## Scores
| date | by | total | c | g | cl | co | s | f |
|---|---|---|---|---|---|---|---|---|
| 2026-07-22 | claude-fable-5 (for MinervaXR) | 83 | 22 | 18 | 13 | 12 | 9 | 9 |

## Scores
| date | by | total | c | g | cl | co | s | f |
|---|---|---|---|---|---|---|---|---|
