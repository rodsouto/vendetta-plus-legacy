# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Returning players** of Vendetta and similar persistent browser strategy games (Ogame-style), back
  for the game they remember: they know the loop (build, produce, train, raid) and expect the
  original's depth and feel.
- **New strategy players** with no crypto background. The blockchain must be invisible: no network
  names, no wallets jargon, no "get ETH" steps (docs/spec/blockchain.md B-01, B-15, B-16).

Main situation: **phone, short sessions several times a day** — check resources, queue rooms,
research and troops, send or follow missions, react to incoming attacks. Desktop is also used, but
the phone comes first.

## Product Purpose

Vendetta Plus: a faithful, fully on-chain revival of the legacy mafia strategy game Vendetta
(docs/spec). Players own map buildings, upgrade rooms, research, train troops and send missions
(attack, station, transport, occupy) to rob unprotected resources, organise in families that go to
war, and trade on a private market. Success: players come back every day because the game is fair,
persistent and theirs.

## Positioning

The rules run entirely in public contracts (Arbitrum One): no operator can cheat, roll back or shut
the world down, and every battle is deterministic and reproducible. Yet it plays like the browser
game people remember, with no crypto friction.

## Operating Context

- Time is the core resource: queues take minutes to days, missions travel for hours; players
  check in to collect, re-queue and respond. Live countdowns and "what finishes next" matter.
- Everything is computed exactly (packages/rules); the client projects the state live between
  transactions and validates actions before sending them (B-20).
- Local development runs against anvil with a dev panel (time travel, dev accounts); production
  accounts come in stage 4b (smart accounts, passkeys, session keys, sponsored gas).

## Capabilities and Constraints

- Ruleset Vendetta: 4 resources (weapons, ammunition, alcohol, dollar), 15 rooms, 16 research,
  21 troops (16 attack, 5 defense); map city 1–50 : neighborhood 1–50 : slot 1–255 (17 × 15 grid).
- Families have three ranks (Capo, SubCapo, Member); messaging, board and chat are off-chain and
  out of scope for now (B-10).
- Premium (longer queues) is granted by the admin; no payments in the client.
- Terminology follows the original game; entity names come from the legacy language files
  (packages/spec-data/generated/i18n).

## Brand Commitments

- Name: Vendetta (Plus). Mafia theme.
- Binding visual constraint from the owner: "modern mafia", with a palette that recalls the
  original game (legacy colors in static/css/styles.css).
- Legacy images in static/img are not reused (rights not confirmed).

## Evidence on Hand

- Full rules specification: docs/spec (chapters, decisions, blockchain decisions, data, vectors).
- Entity names and descriptions in es/en from the legacy game.
- No testimonials, player counts, screenshots of the new game or press exist; do not invent them.

## Product Principles

1. Faithful to the original rules; every number shown is the exact on-chain number.
2. Time is visible: what finishes next, when, and what it costs, always at a glance.
3. The chain is invisible to the player; errors read as game messages, never as transactions.
4. Phone first, short sessions: the most common actions take one or two taps.

## Accessibility & Inclusion

WCAG 2.2 AA (contrast, keyboard navigation, focus, reduced motion). Spanish and English from the
start.
