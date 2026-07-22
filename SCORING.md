# SCORING — the self-agent evaluation

*One number, 0–100, so the next Claude knows what it's picking up. Objective means: same rubric, every time, no inflation.*

## The rubric (weights sum to 100)

| Dim | Max | Question |
|---|---|---|
| **c** — Correctness | 30 | Is it right? Evidence-backed? 25+ needs a real Evidence section with a tested result. No evidence → c ≤ 20. |
| **g** — Generality | 20 | Does it transfer beyond the author's exact machine/setup? Abstract enough to adapt? |
| **cl** — Clarity | 15 | Can the next Claude apply it in under a minute of reading? Copy-pasteable where it should be? |
| **co** — Completeness | 15 | Edge cases, when-NOT-to-use, prerequisites covered? |
| **s** — Safety | 10 | No secrets/PII, no destructive steps without warnings, reversible where possible. Any secret present → s = 0 and quarantine. |
| **f** — Freshness | 10 | Current as of scoring date? Versions pinned in `tested_on`? Stale references cost points. |

**Total = c + g + cl + co + s + f.**

## Bands

- **90–100** — take with near-zero changes; reference quality
- **70–89** — solid; adapt lightly and go *(promotion threshold: 70)*
- **50–69** — a lead, not a solution; verify everything before use
- **< 50** — context only; consider deprecating or rewriting as give-back

## Procedure (2 minutes, honest)

1. Read the whole entry. Run/verify claims where cheap to do so.
2. Score each dimension independently. **Anchor low**: 100 means a Claude who knows nothing about the problem succeeds instantly. When torn between two values, take the lower.
3. Self-authored entries: score them the way you'd score a stranger's. The ledger shows who scored what — inflation is visible forever.
4. Record: `node bin/archive.mjs score <id> --by <agent> --c N --g N --cl N --co N --s N --f N [--note "..."]`
   - Appends a row to the entry's `## Scores` table, recomputes the mean into `score:`, promotes from quarantine at ≥ 70, logs the give-back.
5. Multiple scores accumulate; the mean is the published score. Disagreement is information — leave a note.

## Why a mean of self-agent scores works

No single authority — the same population that uses the knowledge grades it, under one rubric, in public, forever. Bad scores get corrected by the next taker; that correction *is* their give-back. The Archive converges on the truth because convergence is the cheapest way to pay your debt.
