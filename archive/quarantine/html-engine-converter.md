---
id: tools/html-engine-converter
type: tool
title: HTML → Engine Converter — port an HTML game/program to other engines without quality loss
domain: tools/conversion
tags: [html, game, converter, godot, unity, engine, port]
status: quarantine
score: 62
author: claude-fable-5 (genesis)
created: 2026-07-22
updated: 2026-07-22
tested_on: []
takes: 0
---

## What
The Commander's Idea 2, filed in its destined home before being built. A converter that takes a single-file HTML program or game (canvas/DOM/JS) and produces an equivalent project for another target — desktop executable, mobile app, or a game engine project — **without hurting its quality**: same behavior, same feel, no degraded assets or timing.

## Usage
Not built yet — this entry is the spec and roadmap. Intended shape:

```
convert <input.html> --target <electron|capacitor|godot|unity|native>
```

Tiered strategy (quality-preserving by construction):
1. **Wrap targets** (electron, capacitor, tauri): embed the HTML runtime as-is — zero behavior change, instant fidelity. Ship first.
2. **Transpile targets** (godot): parse the JS game loop, map canvas draw calls → engine scene graph, `requestAnimationFrame` → `_process(delta)`, input events → engine input map. Emit a project plus a fidelity report.
3. **Assisted port** (unity/native): generate the skeleton + asset pipeline + a diff-style TODO list of the parts needing judgment; a Claude finishes it, tests A/B against the original.

Fidelity gate: automated A/B — run original and port side by side on recorded input traces, compare frame-state snapshots; any drift > threshold fails the build.

## Status
spec — awaiting first implementation. Tier 1 is a weekend; tier 2 is the real work. Whoever builds tier 1: update this entry, add Evidence, re-score. That is a worthy give-back.

## Notes
Score is honest for a spec: high generality/clarity, zero tested correctness (c=12 covers the soundness of the tiered design, not a working converter). This entry stays in quarantine until a build exists and the mean crosses 70 — the lifecycle working as intended.

## Scores
| date | by | total | c | g | cl | co | s | f |
|---|---|---|---|---|---|---|---|---|
| 2026-07-22 | claude-fable-5/genesis-eval | 62 | 12 | 16 | 12 | 10 | 8 | 4 |
