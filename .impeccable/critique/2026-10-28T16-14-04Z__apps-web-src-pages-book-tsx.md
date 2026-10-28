---
target: "tabla de habitaciones: botón Asentar y columna de nivel"
total_score: 22
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 2
timestamp: 2026-10-28T16-14-04Z
slug: apps-web-src-pages-book-tsx
---
# Critique: rooms table (apps/web/src/pages/Book.tsx, Rooms)

DEGRADED: single-context (scoped to one table; detector clean, run after the review)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Queue entry has no target level; row ignores what is already queued |
| 2 | Match system / real world | 2 | "Asentar"/"Entered" is ledger jargon on the action; original said Construct / Expand to level N |
| 3 | User control | 3 | Cancel per queue item |
| 4 | Consistency | 3 | Same pattern in research/troops |
| 5 | Error prevention | 2 | Cost/time shown for level+1 even when that room is already queued |
| 6 | Recognition | 3 | Requirements inline |
| 7 | Flexibility | 2 | One tap per level |
| 8 | Aesthetic / minimalist | 3 | Level column + short button; space goes to the wrong place |
| 9 | Error recovery | n/a | Not exercised in this scope |
| 10 | Help | 2 | No room description reachable from the row |
| | Total | 22/36 | Acceptable |

## Priority issues
- [P1] Button label "Asentar"/"Enter" does not say what happens. Fix: "Construir" at level 0, "Ampliar a nivel N" otherwise (en: Build / Expand to level N); toasts "Asentado"/"Entered" follow.
- [P1] Row prices the wrong level after queueing the same room (cost/time from b.levels, item priced at start). Fix: N = level + same-room items in queue + 1, row cost/time for N.
- [P2] Level column spends desktop width; move level next to the name, legacy style "Oficina del Jefe (1)", free the width for the longer button.
- [P2] Queue entry shows the room without its target level. Fix: "Campo de entrenamiento → 1".
- [P3] Research table shares the column + one-word button; decide whether it follows.
