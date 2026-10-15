# Social Systems

Legacy rules with source citations. Target changes: [D-18](decisions.md#d-18--vacation--keep--fix),
[D-19](decisions.md#d-19--market--keep--fix), [D-20](decisions.md#d-20--families--wars--keep--fix).

## Vacation mode

**Sources:** `application/models/Vacaciones.php`, `modules/mob/controllers/OpcionesController.php`,
`library/Mob/Controller/Plugin/Edificio.php`, `application/forms/Misiones.php`.

- **Duration:** 15 days. A player is on vacation while their latest vacation record has no end date
  and `start + 15 days > now`; it expires on its own (`Vacaciones.php:26-39`).
- **Activation:** only if not already on vacation and the player has **no missions of their own**
  in progress, including returning ones (`OpcionesController.php:111-118`). Incoming enemy missions
  do not block it.
- **Cooldown:** 7 days after the previous vacation ended (`Vacaciones.php:48-57`). The first
  vacation is always allowed. Legacy only enforces this in the UI.
- **Deactivation:** manual, at any time, with no minimum duration.
- **While on vacation:**
  - The player's account is locked: every page redirects to the vacation screen, so they cannot
    build, research, train or send missions.
  - Nobody can **send** any mission (attack, station, transport, occupy) to the player's buildings.
    Missions already travelling resolve normally.
  - Production and queues **keep running**.

## Market

**Sources:** `application/models/Mercado.php`, `modules/mob/controllers/MercadoController.php`,
`forms/Mercado/Propuesta.php`, `forms/Misiones/Coordenadas.php`, `Controller/Plugin/Update.php`.

A trade is a private agreement between a **seller** and a named **buyer**, delivered with ordinary
transport missions.

### Offer

- The seller sets: buyer (must exist, cannot be the seller), resource sold (`weapons`,
  `ammunition` or `dollar` — never alcohol), quantity, and a price in any mix of `weapons`,
  `ammunition`, `dollar`.
- The price must match one of two fixed exchange rates exactly:

  | Rate | 1 dollar = |
  |------|------------|
  | `3-5-1` | 3 weapons = 5 ammunition |
  | `2-4-1` | 2 weapons = 4 ammunition |

  `quantity == Σ price[r] × rate[sold] / rate[r]` (the rate is not stored with the offer).
- No fee, no escrow, no stock check, no limit on open offers. The buyer is notified.

### Acceptance and delivery

- Only the buyer can accept a pending offer. Acceptance opens a **10-day** delivery window and
  notifies the seller. Pending offers never expire.
- Accepted trades with an outstanding balance appear as extra options in the mission form; choosing
  one sends a **transport** mission.
- When a transport from player A arrives at a building of player B, the resources are always
  credited first; then legacy settles them against the **oldest** accepted, unexpired trade between
  A and B (`Mercado.php:71-135`):
  - **Seller side:** the shipment must contain exactly one resource, the one sold, not exceeding
    what remains; it adds to `delivered`.
  - **Buyer side:** each resource sent must not exceed what remains of the price; it adds to `paid`.
  - Otherwise the shipment counts as a plain transport.
  - Partial deliveries add up; alcohol is ignored.
- After 10 days the trade simply stops settling. There is no penalty, refund or notice.

### Cancellation

Legacy: the seller can cancel a pending offer; because of an operator-precedence bug the buyer can
delete a trade at any time, even accepted and partly delivered. Target: only pending offers can be
cancelled, by either party (D-19).

## Families

**Sources:** `application/models/Familias*.php`, `models/Familias/*`,
`modules/mob/controllers/FamiliasController.php`, `forms/Familia/*`, `library/Mob/Validator/InfoFamilia.php`.

- **Founding:** unique tag (2–8 characters) and unique name (2–35). Creates the ranks Capo,
  SubCapo and Miembro; the founder is Capo. **No member limit.**
- **Joining:** by application (free text). A member whose rank has `aceptar_miembro` accepts or
  rejects; accepting makes the applicant Miembro and deletes their other applications. Applicants
  can withdraw. There are no invitations.
- **Leaving:** anyone but the Capo can leave. Capo or SubCapo can kick members.
- **Leadership:** the Capo can hand over leadership; the old Capo becomes SubCapo.
- **Dissolving:** Capo only. Deletes memberships and applications and ends every active war as a
  loss for this family.

### Ranks and permissions

| Rank | Type | Permissions |
|------|------|-------------|
| Capo | 0 | all |
| SubCapo | 1 | all |
| Miembro | 2 | none (cannot be edited) |
| Custom | 4 | editable set |

Permissions: `leer_mensaje`, `escribir_mensaje`, `borrar_mensaje` (family board), `aceptar_miembro`,
`enviar_circular`, `recibir_circular` (circular mail to members). Capo/SubCapo assign any rank except
Capo. The board shows the last 50 posts.

## Wars

**Sources:** `application/models/Guerras*.php`, `models/Guerras/*`, `FamiliasController.php`,
`forms/Guerra/*`, `library/Mob/Combat/Manager.php`.

- **Declaring:** Capo or SubCapo, against another family not already at war with ours. Takes
  effect immediately; no acceptance, cooldown or points restriction.
- **Score:** every battle between members of the two families adds each side's lost troop points
  to that family's losses (`ptos_perd_1`, `ptos_perd_2`).
- **Ending:** a surrender (the receiving family wins) or a draw offer is sent by the Capo and
  accepted or rejected by the other family's Capo or SubCapo. Score never ends a war automatically.
- **Effect:** bookkeeping only. War does not change combat, targeting or loot. Members of the same
  family can attack each other.

## Messaging

- Player mail: comma-separated list of existing recipients; subject optional, body required; no rate,
  recipient or length limits. System notices are sent with sender 0 (`application/models/Mensajes.php`).
- Every game event (troops incoming, battle, building finished, delivery, etc.) sends the affected
  players a system notice.
- `library/Mob/Mensajes.php` is unused legacy code.

## Moderation

- **Bans:** an admin sets a reason and end date; login is refused while the ban is active and lifted
  automatically after it ends. Checked only at login.
- **Multi-accounts:** no automatic detection. Admins keep a manual list of user pairs sharing an IP
  (`IpsCompartidas`); login IPs are logged.
- **Newbie protection:** none. The only attack restrictions are vacation and not attacking yourself.

## Chat

`static/js/chat.js` and the chat controller provide a real-time chat outside the game mechanics.
Not specified.
