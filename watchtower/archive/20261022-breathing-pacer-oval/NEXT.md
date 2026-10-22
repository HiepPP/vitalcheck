# NEXT

## Current Active Plan

- Title: Breathing pacer on the face oval
- Slug: 20261022-breathing-pacer-oval
- Status: ARCHIVED
- Updated: 2026-10-22

## Tracker

One row per TASK. Group ties together items that ship as one transaction.

| Order | TASK | Group | Status | Spec | Deps | Context | Notes |
|-------|------|-------|--------|------|------|---------|-------|
| 1 | TASK-001 Breathing pacer on the face oval | standalone | DONE | [watchtower/tasks/TASK-001-breathing-pacer-oval.md](watchtower/tasks/TASK-001-breathing-pacer-oval.md) | - | - | Built in a7cc113, 63bfea7, 5ecb14b (design 3a). Owner real-face checks passed (Q-001). |

TASK Status labels: TODO, IN PROGRESS, BLOCKED, DONE.
Plan-level Status header: ACTIVE while any row is open, DONE when all rows DONE, ARCHIVED after archive.

## Plan Verify

- `npm run build` -> exit 0 (typecheck and Vite build).
- `npm test` -> all tests pass, including the new [src/breath.test.ts](src/breath.test.ts).

## Review Focus

- Face lost mid-scan, then the measurement restarts -> the pill keeps its rhythm and does not jump back to "Breathe in"; owner TASK-001
- A second scan from "Measure again" -> the pill starts again at "Breathe in · 4"; owner TASK-001
- `prefers-reduced-motion: reduce` -> the oval, rings, and trace stay still, and the pill still counts down; owner TASK-001
- Guide mode (`?track=0`) -> the oval keeps its size, and only the glow and rings breathe; owner TASK-001
- Narrow viewport, 320 px wide -> the pill fits in the video view and does not cover the HUD or corner brackets; owner TASK-001

## Handoff

- Next action: review `feat/breathing-pacer-oval` and merge it to `main`, then run `/watchtower archive`.

## Archive

- Archived: 2026-10-22 -> watchtower/archive/20261022-breathing-pacer-oval/
