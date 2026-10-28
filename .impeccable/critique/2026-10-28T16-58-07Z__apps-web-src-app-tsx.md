---
target: navegación e IA frente al juego original
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-10-28T16-58-07Z
slug: apps-web-src-app-tsx
---
# Critique: IA / navigation shell vs legacy Vendetta (App.tsx shell, Book.tsx, Missions, Market, Map)

Method: dual-agent. Total 24/40 (Acceptable).

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | No account-wide threat state, no nav badge |
| 2 | Match real world | 3 | Legacy terms; "Índice" hard-coded es |
| 3 | User control | 3 | Selection resets on reload |
| 4 | Consistency | 2 | Selector only in Ledger; implicit building in Missions/Map/Market |
| 5 | Error prevention | 3 | Origin and deposit building implicit |
| 6 | Recognition vs recall | 1 | Must remember which buildings are idle/threatened |
| 7 | Flexibility | 1 | No overview, no prev/next |
| 8 | Aesthetic | 3 | Disciplined |
| 9 | Error recovery | 3 | Game-language errors |
| 10 | Help | 3 | Rules + guide |

## Answers to owner
1. Vista general: yes, landing page with >=2 buildings: incoming alert band (hidden missions once, with candidate buildings), one row per building with stamps (ATACADO/POSIBLE ATAQUE red, ALMACEN LLENO red, SIN OBRAS / SIN ENTRENAMIENTO ink) + next countdown, research line, 3 missions in flight.
2. Keep Ledger tabs; add counters on tabs; fix research "Cola 0/N" in non-research building and name the building in book.researchHere.
3. Vision global as a mode of the overview (Estado | Recursos | Tropas); phone transposed 4-col; full room grid only >=60rem.
4. Switcher in spine, prev/next, sheet with stamps, red dot, persisted; theme/lang move to Account. Explicit origin field in Missions and deposit source in Market.

## Priority issues
- [P0] No account-wide threat/idle view -> overview + badges (shape)
- [P1] Hidden incoming not red in Ledger: Book.tsx:306 requires kind===ATTACK; Missions.tsx:372 uses m.hidden||ATTACK (harden)
- [P1] Implicit building dependencies: Missions origin, Market deposit (Market.tsx:259-266), Map station (clarify)
- [P2] 9 tabs on phone at 0.6rem labels -> 5 + Más (adapt)
- [P3] Research counter/copy, aria-label "Índice", off-scale font sizes, guide paragraph occluded by button (polish)

## Detector
CLI: 9 findings in styles.css (6 design-system-font-size incl. 0.6rem thumb-index:954; side-tab .approve:994; 2 colors = false positives). Browser: #/book 15 (line-length, 10.56px "Completo", cramped padding, text-occlusion, all-caps, em-dash FP); #/missions, #/map clean.

## Personas
Alex: ~10 selects + 30 tab taps per audit. Casey: selector top, tiny labels, attacks missed. Sam: no live announcement, "Índice". Veteran: no Vision general/global.

## Questions
- Move Balance + Next entries to overview rows, Ledger as catalog?
- Research out of the Ledger into the overview?
- Rank hidden-mission candidate buildings by likelihood?
