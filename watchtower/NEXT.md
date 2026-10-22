# NEXT

## Current Active Plan

- Title: HRV and breathing rate under the pacer
- Slug: 20261022-hrv-and-breathing-rate
- Status: ACTIVE
- Updated: 2026-10-22

## Tracker

| Order | TASK | Group | Status | Spec | Deps | Context | Notes |
|-------|------|-------|--------|------|------|---------|-------|
| 1 | TASK-002 HRV and breathing logic | A | DONE | [watchtower/tasks/TASK-002-hrv-breathing-logic.md](watchtower/tasks/TASK-002-hrv-breathing-logic.md) | - | [watchtower/CONTEXT.md](watchtower/CONTEXT.md) | Pure logic and tests. |
| 2 | TASK-003 HRV panel in the result view | B | IN PROGRESS | [watchtower/tasks/TASK-003-hrv-result-panel.md](watchtower/tasks/TASK-003-hrv-result-panel.md) | TASK-002 | [watchtower/CONTEXT.md](watchtower/CONTEXT.md) | Depends on TASK-002. |
| 3 | TASK-004 Document HRV and breathing | C | IN PROGRESS | [watchtower/tasks/TASK-004-hrv-readme.md](watchtower/tasks/TASK-004-hrv-readme.md) | TASK-002 | [watchtower/CONTEXT.md](watchtower/CONTEXT.md) | Depends on TASK-002. Runs beside TASK-003. |

TASK Status labels: TODO, IN PROGRESS, BLOCKED, DONE.

## Plan Verify

- `npm run typecheck` -> exit 0
- `npm test` -> all tests pass, including [src/hrv.test.ts](src/hrv.test.ts)
- `npm run build` -> exit 0
- Human check with a real face on `npm run dev`: one full scan shows heart rate, blood pressure, and the HRV panel with the guided-breathing note.

## Review Focus

- Camera below 25 fps -> HRV is withheld with a reason, heart rate still shows; owner TASK-002
- User breathes at their own pace, not with the guide -> HRV still shows, with a "did not match the guide" note; owner TASK-002 and TASK-003
- One missed beat in the middle of the scan -> the long IBI is dropped and RMSSD stays near the true value; owner TASK-002
- Extra false feet or an alternating rhythm -> HRV is withheld, never clamped; owner TASK-002
- Weak signal, or "Measure again" after a good scan -> HRV panel shows the reason or the new values, never stale ones; owner TASK-003

## Handoff

- Next action: run `watchtower implement`.

## Archive

- [watchtower/archive/20261022-breathing-pacer-oval/NEXT.md](watchtower/archive/20261022-breathing-pacer-oval/NEXT.md)
