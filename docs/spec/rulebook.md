# Vendetta rulebook

Rules for the abuse the contracts cannot see (B-13, B-23), applied from launch. The `arbiter` role
(B-14: a Safe in v1, Kleros later) judges reports against this text and sanctions with
`suspend(player, until)`. Spanish version: [rulebook.es.md](rulebook.es.md); if the two differ, the
English one prevails.

## 1. What is allowed

Everything the contracts allow is allowed unless a rule below forbids it. In particular:

- **Several accounts per person.** Nothing in the chain tells who is behind an account, so having
  several accounts is not sanctioned. What is sanctioned is pushing between them (rule 4).
- **Automation.** The contracts are a public API; scripts and bots are legitimate (B-13).
- **Sharing and giving away accounts.** An account can have several controllers (devices, people)
  and can be transferred (B-26). Selling an account is allowed.

## 2. Evidence

- **Game events are the strongest evidence.** Every battle (`Battle`), transport, trade, point
  change (`PointsChanged`), family and war is public on the chain. Reports cite transaction hashes.
- Screenshots, chats and statements count less: they are accepted when they match the game events
  or concern things the game does not record (messages, agreements).
- A report names the accused player, the rule and the transactions. The arbiter may look at any
  other public event.

## 3. Bug abuse

- Using a bug of the contracts, the client or the infrastructure to gain an advantage is forbidden.
  **The rules are the specification (`docs/spec/`)**, not what the code happens to do: a behaviour
  that contradicts the specification is a bug, even if the contract accepts the transaction.
- Whoever finds a bug must report it privately to the team, not publish it nor use it.
- Sanction: at least 1 day of suspension, up to a permanent one, depending on the gain and the harm.
  Knowingly not reporting a bug that one used or saw used is sanctioned the same way.

## 4. Pushing

**Pushing** is a player getting resources from another account without giving back their value.
It is forbidden, also during a war.

**Gifts.** Sending resources to another player without a return (a transport that pays nothing) is
allowed only if all of these hold:

1. When the resources arrive, the receiver has **at most half the points** of the sender (B-19).
2. The receiver **stays at or below half** the sender's points for the **14 days** after the
   arrival.
3. Everything the sender gives that receiver in any 24-hour window is **less than half the
   sender's daily production** of each resource sent: 24 times the hourly production of that
   resource summed over all the sender's buildings, as the game shows it when sending.

**Alcohol** is never traded: any transfer of alcohol to another player counts as a gift.

**Exchanges.** The market (B-11) is the way to trade: its trades use the market rates and never
count as pushing. An exchange outside the market (transports both ways) is allowed only if the
return arrives within **48 hours** of the first shipment and at one of the market rates
(`market.exchange_rates`, [game_config.yaml](data/game_config.yaml)); otherwise each shipment is
judged as a gift.

**Also pushing:**

- Leaving resources in buildings so that another account can take them with attacks (being looted
  on purpose).
- Creating accounts to send their starting resources (`new_player`) or their production to another
  account.
- Accepting market trades with no intention to pay, so that the buyer's deposit goes to the seller.
- Loans: resources given now to be paid back later.
- Extortion: resources paid under threat of attacks, when they do not meet the gift conditions.
- Any other way for an account to get resources without giving back their value.

The sanction applies to the sender and to the receiver when the receiver knew. When the accounts
belong to the same person, both are sanctioned.

## 5. Bashing

**Bashing** is attacking the same building **more than 5 times in 24 hours**: the sixth attack by
the same player that arrives within any 24-hour window against one building breaks the rule.

- Every Attack mission that produces a battle counts, whatever troops it carries, except an attack
  that carries **only spy troops** (spying, [06-combat.md](06-combat.md#espionage)).
- Attacks are counted per attacking player, adding up all their buildings, and per target building.
- Attacks between members of two families **at war** at the moment of the battle do not count
  (B-31), provided both families have at least 2 members, unless the war is abusive (rule 6).

## 6. Wars

Wars are declared and ended in the game (B-31); the chain is the register, and no admin needs to
acknowledge them. During a war the bashing limit does not apply between the two families (rule 5);
pushing is still forbidden (rule 4).

**Abusive wars.** The exemption is meant for rivals, not for harassing a much weaker family: a war
is declared without the other family's consent, and only the declaring side can accept its
surrender. The arbiter may judge a war abusive and count its attacks as bashing. It weighs the case
as a whole, with no fixed threshold, considering:

- the gap in points and members between the two families;
- whether the weaker family offered to surrender or a draw and the offer was refused or ignored;
- how long the attacks go on and how often they hit the same buildings;
- whether the attacks are worth anything to the attacker (loot, war score) or only keep the
  victims from playing.

## 7. Names and content

Family names and tags (on-chain, B-31), messages, chat, family boards and any image or text shown
in the game (off-chain, B-10) must not be pornographic, offensive, racist or illegal, nor infringe
third-party rights, nor advertise other games. Family boards may only link to content related to
the family.

On-chain names cannot be changed or erased: the client hides them, and the player who created the
family can be suspended. Off-chain content is removed.

## 8. No rollbacks

Nobody is reimbursed or restored for losses caused by a bug, an outage or a contract upgrade. Bugs
are fixed forward (B-17). A ruling never moves resources, troops or buildings: the only sanction is
suspension (B-14).

## 9. Sanctions

The only sanction is **suspension** (B-14). A suspended player cannot act (build, research, train,
send missions, trade, change family, transfer the account) but keeps producing, its running queues
and missions complete, and **it can be attacked**. The arbiter sets the length according to the
gain, the harm and repetition; a permanent suspension has no end date.

## Not forbidden

Usual rules of browser games that this rulebook leaves out on purpose:

| Rule | Why |
|------|-----|
| Account sharing | An account can have several controllers (B-26) |
| Multi-accounting | Not detectable on-chain; only pushing between accounts is sanctioned (rule 4) |
| Account sitting and exchange | Controllers and `transferPlayer` (B-26) |
| Scripts and bots | Automation is legitimate (B-13) |
| Ownership, real-money trading | Accounts can be given away (B-26) and will be tokens (B-24) |
| War register, founders, inactivity | Wars live on-chain (B-31) |
| Attacking admin accounts | There are none |
| Inactivity and `[4SALE]` | Vacation is on-chain (D-18); inactive accounts stay attackable |
