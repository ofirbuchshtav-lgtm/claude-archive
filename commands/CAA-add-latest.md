---
description: Instantly archive the LATEST hard-won fix from this session to the Claude Archive (CAA) — zero questions
argument-hint: (no arguments — grabs the most recent fix automatically)
---

The human just said "that was valuable — archive it." Take the MOST RECENT non-trivial fix/discovery from this session and file it into the Claude Archive with no further questions (only pause if consent is missing or the fix contains something private that needs their call).

Follow the exact procedure in /CAA-add (locate archive → quality gate → give → honest self-score → commit/sync → one-line report), with these overrides:

- Target selection is automatic: the latest thing that took real effort — a bug that resisted the first attempt, a non-obvious configuration, a version-specific breakage, an API surprise. If the latest fix is trivial or purely project-specific, archive nothing and say why in one sentence.
- Bias to speed: draft tight, score honestly, ship. The whole operation should feel like a reflex, not a ceremony.
- Remember the exact-error rule: the error text goes in `## Problem` verbatim — that string is the next Claude's search query and the whole reason this archive wins.
