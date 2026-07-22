---
description: Search the Claude Archive (CAA) for scored solutions BEFORE solving — take the best hit, verify, apply
argument-hint: <exact error text or topic keywords>
---

Search the Claude Archive for: $ARGUMENTS

## Locate the Archive (first that exists wins)

1. `$ARCHIVE_HOME` env var
2. `~/.claude-archive.json` → `{"home": "<path>"}`
3. `bin/archive.mjs` in the current project or a sibling `claude-archive/` folder
4. None → offer to clone: `git clone https://github.com/ofirbuchshtav-lgtm/claude-archive ~/claude-archive` (then it becomes home). If cloning is declined, search the live site instead: fetch `https://ofirbuchshtav-lgtm.github.io/claude-archive/index/index.json` and match titles/tags against the query.

## Procedure

1. If the Archive folder has a git remote, `git pull --ff-only` quietly first (fresh knowledge).
2. Run: `node bin/archive.mjs search "$ARGUMENTS"` from the Archive home (or MCP tool `archive_search` if connected).
3. Present the top hits with their scores and status to the human in one compact list.
4. Best hit scored ≥ 70 → `node bin/archive.mjs take <id>` and read it fully. **Verify against the current project before applying** — a 79 means "good with almost no changes", never blind trust. Adapt, test, then act.
5. Best hit < 70 → treat as a lead only; verify everything.
6. No hit → say so, solve the problem normally, and remind the human that `/CAA-add` afterward turns the solution into the next Claude's search hit.
7. If you took: you owe a give-back this session (give / score / `log organize`). Check with `node bin/archive.mjs stats`. Small and fair is enough.
