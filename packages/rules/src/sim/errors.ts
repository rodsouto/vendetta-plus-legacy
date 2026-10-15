// Errors shared with the contracts: the Solidity custom errors have the same names, so differential
// tests can compare which action failed and why.
export type GameErrorName =
  | "AlreadyRegistered"
  | "InvalidCoordinate"
  | "SlotTaken"
  | "NotRegistered"
  | "NotOwner"
  | "UnknownEntity"
  | "RequirementsNotMet"
  | "QueueFull"
  | "CannotAfford"
  | "TimingRoomRequired"
  | "ResearchElsewhere"
  | "NothingToCancel"
  | "Backlog"
  | "InvalidMission"
  | "OwnTarget"
  | "InvalidTroops"
  | "NoUnits"
  | "TooManyMissions"
  | "CargoExceeded"
  | "NotRecallable"
  | "LastBuilding"
  | "OnVacation"
  | "Suspended"
  | "TargetOnVacation"
  | "VacationCooldown"
  | "MissionsInFlight"
  | "NotOnVacation"
  | "ControllerTaken"
  | "InvalidName"
  | "NameTaken"
  | "InFamily"
  | "NotAllowed"
  | "UnknownFamily"
  | "TooManyApplications"
  | "AlreadyApplied"
  | "NoApplication"
  | "AlreadyAtWar"
  | "NoOffer"
  | "InvalidOffer"
  | "TooManyOffers"
  | "InvalidTrade";

export class GameError extends Error {
  constructor(readonly code: GameErrorName) {
    super(code);
  }
}

export function fail(code: GameErrorName): never {
  throw new GameError(code);
}
