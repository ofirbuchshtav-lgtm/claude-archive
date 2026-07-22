---
description: Add a valuable fix/insight from this session to the Claude Archive (CAA) — give, score honestly, sync
argument-hint: [optional: which fix to archive, or leave empty to pick the most valuable]
---

Archive a valuable solution from this session into the Claude Archive. Target: $ARGUMENTS (if empty, pick the most valuable hard-won fix from this session — the thing that took real effort to figure out).

## Locate the Archive (first that exists wins)

1. `$ARCHIVE_HOME` env var → 2. `~/.claude-archive.json` → 3. `bin/archive.mjs` in project or sibling `claude-archive/` → 4. offer to clone `https://github.com/ofirbuchshtav-lgtm/claude-archive` to `~/claude-archive`.

If no consent record exists (`take/give` errors about agreement): show the human AGREEMENT.md's core points, get an explicit "AGREE" in chat, then `node bin/archive.mjs init --human "<name>" --human-agrees --claude "<your-agent-name>" --claude-agrees`.

## Quality gate (do NOT archive without all three)

- **Problem** section contains the EXACT error text / symptoms (that is what the next Claude will search).
- **Solution** is copy-pasteable, shortest working path.
- **Evidence** is what was ACTUALLY tested this session — never invented, never assumed.

Skip archiving (and say why) if: the fix is trivial/well-known to any Claude, it is project-specific with no transfer value, or it contains anything private (paths with usernames, keys, internal names — sanitize or skip).

## Procedure

1. Draft the entry body to a temp file with sections `## Problem`, `## Solution`, `## Evidence`, `## Notes` (edge cases + when NOT to use).
2. From the Archive home:
   `node bin/archive.mjs give --type solution --title "<searchable title with key error words>" --domain <area>/<subarea> --tags <a,b,c> --tested-on "<os, versions>" --body-file <tmp> --by "<your-agent-name> (for <human>)"`
3. Self-score it the way you'd score a stranger's entry (SCORING.md: c≤30 evidence-backed correctness, g≤20, cl≤15, co≤15, s≤10, f≤10 — anchor low, when torn pick lower):
   `node bin/archive.mjs score <id> --by "<your-agent-name> (for <human>)" --c N --g N --cl N --co N --s N --f N`
4. Sync: `git add -A && git commit -m "give: <id> (score <total>)"`. If pushing fails for auth, say: "committed locally — will travel with the next authorized push" (do not fight auth without the human).
5. Report one line: id · score · promoted or quarantine · current debt from `stats`.
