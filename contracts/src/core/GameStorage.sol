// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ROOMS, RESEARCH, RESOURCES, TROOPS} from "../generated/VendettaRuleset.sol";

/// A queue item. `finishAt` = 0 while it has not started (B-29: duration is computed at start).
struct QueueItem {
    uint8 index; // room or research index
    uint64 seq; // global creation order: breaks ties between events at the same second (D-08)
    uint40 finishAt;
}

/// A troop batch: paid when queued, delivered whole when it finishes.
struct TrainingItem {
    uint8 troop;
    uint64 seq;
    uint40 finishAt;
    uint64 quantity;
}

uint8 constant ATTACK = 1;
uint8 constant STATION = 2;
uint8 constant TRANSPORT = 3;
uint8 constant OCCUPY = 4;

struct Mission {
    uint64 owner;
    uint64 origin; // building the troops left from and return to
    uint8 kind; // ATTACK, STATION, TRANSPORT, OCCUPY
    bool returning;
    uint8 city; // target
    uint8 neighborhood;
    uint8 slot;
    uint40 start;
    uint40 arrival;
    uint40 duration; // one-way travel time; the return takes the same
    uint64 seq; // order among missions arriving at the same second (D-08)
    uint64[TROOPS] troops;
    uint64[RESOURCES] cargo; // whole resources
    uint64 trade; // market trade this transport delivers for (D-19), 0 = none
    uint8 fromCity; // coordinate of the origin at send
    uint8 fromNeighborhood;
    uint8 fromSlot;
    // Hidden missions (B-22): kind and target stay 0 until revealed; public missions have cover 0.
    bool hidden; // kind and target not revealed yet
    uint32 cover; // declared distance in grid units (≥ the real one) that duration and salary used
    bytes32 commit; // keccak256(abi.encode(owner, kind, city, neighborhood, slot, salt))
}

uint8 constant CAPO = 1;
uint8 constant SUBCAPO = 2;
uint8 constant MEMBER = 3;

struct Family {
    bool alive; // false once dissolved: memberships, applications and wars pointing to it lapse
    uint64 members;
    string tag;
    string name;
}

uint8 constant OFFER_NONE = 0;
uint8 constant OFFER_SURRENDER = 1;
uint8 constant OFFER_DRAW = 2;

struct War {
    uint64 a; // declaring family
    uint64 b;
    uint128 lostA; // centipoints of troops lost by members of a in battles against b
    uint128 lostB;
    bool ended;
    uint64 winner; // 0 = draw (or still running)
    uint8 offer; // OFFER_*
    uint64 offerBy; // family that made the offer
}

/// A market trade (D-19, B-11). From acceptance it holds the seller's goods and the buyer's
/// deposit; each party withdraws its shares. Its terms (rate, window end, deposit) never change
/// once set, whatever later configuration or upgrade (B-17).
struct Trade {
    uint64 seller;
    uint64 buyer;
    uint64 from; // the seller's building the goods leave at acceptance
    uint8 sold; // resource index
    bool accepted;
    uint40 closesAt; // the window end, set at acceptance: payments must arrive by then
    uint64 quantity;
    uint64[RESOURCES] price;
    uint64[RESOURCES] rate; // values of the exchange rate the price matched, per resource (B-11)
    uint64[RESOURCES] deposit; // the buyer's deposit held at acceptance
    uint64[RESOURCES] paid;
    uint64[RESOURCES] sellerTook; // withdrawn by the seller
    uint64[RESOURCES] buyerTook; // withdrawn by the buyer
}

struct Building {
    uint64 owner;
    uint8 city;
    uint8 neighborhood;
    uint8 slot;
    uint40 lastUpdate;
    uint128 centipoints; // fills the first slot with the fields above: every settle touches it
    uint16[ROOMS] levels;
    uint128[RESOURCES] stock; // units of 1/STOCK_SCALE (B-27)
    QueueItem[] roomQueue;
    uint64[TROOPS] troops; // units at home
    TrainingItem[][2] training; // attack and defense training rooms
    // Returning troops came home then; sends wait RETURN_COOLDOWN (B-22). Last, so it has a slot
    // of its own touched by sends and returns only, and appended for upgrade hygiene.
    uint40 lastReturn;
}

struct Player {
    address[] controllers; // devices and recovery codes, 1..MAX_CONTROLLERS (B-26)
    uint64 researchBuilding; // building of the research queue, 0 when the queue is empty
    uint32 buildings;
    uint128 centipoints; // rooms of every building + research + troops at home and in missions (B-19)
    uint32 missions; // missions in flight, outbound or returning (B-09)
    uint16[RESEARCH] research;
    QueueItem[] researchQueue;
    uint40 vacationUntil; // on vacation while now < vacationUntil (D-18)
    uint40 suspendedUntil; // suspended while now < suspendedUntil (B-14)
    uint40 premiumUntil; // B-25
    uint64 family; // valid only while that family is alive
    uint8 rank; // CAPO, SUBCAPO, MEMBER
    uint64[] applications; // families applied to (B-31)
    uint64[] offers; // trades as seller: pending, not final, or final with a share left (B-11 cap)
    uint32 sessionEpoch; // bumped by transferPlayer and removeController: older sessions die (B-15)
    uint40 vacationStart; // when the last vacation started: hidden missions sent during it bounce (B-22)
    uint40 tradeLockUntil; // latest window end of an accepted trade: no vacation while now ≤ it (D-18)
    address transferTo; // pending transfer target (B-26), 0 = none
    uint40 transferAt; // when the pending transfer can be accepted
    uint64 vacationSeq; // creation order of the last vacation start: same-second sends (B-07, B-22)
    uint64[] purchases; // trades as buyer: not final, or final with a share left (B-11 cap)
}

/// A session key: an address allowed to play for a player until `until` (B-15).
struct Session {
    uint64 player;
    uint40 until;
    uint32 epoch;
}

uint8 constant INVITE_SESSION = 1;
uint8 constant INVITE_CONTROLLER = 2;

/// An invitation to play for a player as a session, or to manage it as a controller (B-15, B-26):
/// the invited address binds itself by accepting, nobody binds it. Dies with the player's epoch.
struct Invite {
    uint8 kind; // INVITE_*, 0 = none
    bool recovery; // controller invitations: a recovery code rather than a device
    uint40 until; // sessions: the authorization's end; controllers: when the invitation expires
    uint32 epoch; // the player's sessionEpoch when invited
}

/// Per-controller data (B-26), keyed by address: a controller manages one player at a time and its
/// entry is deleted when it leaves the player.
struct ControllerInfo {
    bool recovery; // a recovery code's account rather than a device (B-15)
    uint40 removalAt; // its removal was scheduled and can be executed from here; 0 = none
}

/// Core state (ERC-7201 namespace "vendetta.storage.core").
struct CoreState {
    uint64 seq;
    uint40 globalPremiumUntil; // B-25: the admin can give premium to every player for a while
    uint64 nextPlayer;
    uint64 nextBuilding;
    mapping(uint64 => Player) players;
    mapping(uint64 => Building) buildings;
    mapping(address => uint64) playerOf;
    mapping(uint256 => uint64) buildingAt; // coordinate key → building
    uint64 nextMission;
    uint64 activeMissions;
    mapping(uint64 => Mission) missions;
    uint64[] heap; // the global mission queue (B-07), see Heap.sol
    mapping(uint64 => uint256) heapPos; // 1-based position in `heap`, 0 = not queued
    // The parked list (B-22): due hidden missions nobody revealed yet, out of the queue, as a doubly
    // linked list in (arrival, seq) order (the drain parks them in queue order, so appending keeps
    // it sorted). A reveal checks its predecessor only.
    uint64 parkedHead;
    uint64 parkedTail;
    mapping(uint64 => uint64) parkedPrev; // 0 at the head
    mapping(uint64 => uint64) parkedNext; // 0 at the tail
    uint64 nextFamily;
    mapping(uint64 => Family) families;
    mapping(bytes32 => uint64) familyNames; // normalized tag / name → family (B-31)
    uint64 nextWar;
    mapping(uint64 => War) wars;
    mapping(bytes32 => uint64) activeWar; // family pair → running war
    uint64 nextTrade;
    mapping(uint64 => Trade) trades;
    mapping(address => Session) sessions; // session address → authorization
    mapping(address => ControllerInfo) controllerInfo; // B-26
    mapping(address => mapping(uint64 => Invite)) invites; // invited address → player → invitation
}

library GameStorage {
    // keccak256(abi.encode(uint256(keccak256("vendetta.storage.core")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CORE_SLOT =
        0x2e855d24af35474e7fcffb8e2883e0dc8ae23c6929e76907fda8751c5fa2b800;

    function core() internal pure returns (CoreState storage s) {
        bytes32 slot = CORE_SLOT;
        assembly {
            s.slot := slot
        }
    }

    function coordKey(uint256 city, uint256 neighborhood, uint256 slot)
        internal
        pure
        returns (uint256)
    {
        return (city << 16) | (neighborhood << 8) | slot;
    }
}
