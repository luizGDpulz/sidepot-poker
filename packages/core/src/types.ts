export type Chips = number;
export type PlayerId = string;
export type SeatIndex = number;

export type HandStreet =
  | 'IDLE'
  | 'PREFLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'COMPLETE';

export type PlayerHandStatus =
  | 'WAITING'
  | 'ACTIVE'
  | 'ALL_IN'
  | 'FOLDED'
  | 'SITTING_OUT'
  | 'ELIMINATED';

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly avatar?: string;
  readonly seatIndex: SeatIndex;
  readonly stack: Chips;
  /** Chips wagered on the current betting street */
  readonly streetBet: Chips;
  /** Total chips committed across the entire active hand (antes + all streets) */
  readonly handContribution: Chips;
  /** Stack at the start of the active hand (used for TDA simultaneous bustout tie-breaking) */
  readonly startingHandStack: Chips;
  readonly status: PlayerHandStatus;
  /** Full-raise sequence number at which this player last voluntarily acted on the current street */
  readonly lastActedFullRaiseCount: number | null;
  readonly rebuyCount: number;
  readonly addOnCount: number;
}

export interface Pot {
  readonly id: string;
  readonly label: string;
  readonly amount: Chips;
  readonly eligiblePlayerIds: readonly PlayerId[];
}

export interface PotAward {
  readonly potId: string;
  readonly winnerIds: readonly PlayerId[];
  readonly payouts: Readonly<Record<PlayerId, Chips>>;
}

export interface BlindLevel {
  readonly level: number;
  readonly smallBlind: Chips;
  readonly bigBlind: Chips;
  readonly ante: Chips;
  readonly durationSeconds: number;
}

export interface EliminationEntry {
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly handNumber: number;
  readonly finishPosition: number;
  readonly startingHandStack: Chips;
}

export interface TableConfig {
  readonly maxSeats: number;
  readonly startingStack: Chips;
  readonly blindSchedule: readonly BlindLevel[];
  readonly allowRebuys: boolean;
  readonly maxRebuysPerPlayer: number;
  readonly rebuyMaxLevel: number;
  readonly rebuyStack: Chips;
  readonly allowAddOn: boolean;
  readonly addOnStack: Chips;
}

export interface StreetBettingState {
  /** Highest streetBet posted on the current street */
  readonly currentBet: Chips;
  /** Highest streetBet produced by a full legal bet/raise (or cumulative short all-ins reaching minRaiseIncrement) */
  readonly lastFullRaiseBet: Chips;
  /** Minimum legal raise increment on top of currentBet */
  readonly minRaiseIncrement: Chips;
  /** Monotonic sequence counter incremented whenever a full raise reopens betting */
  readonly fullRaiseCount: number;
}

export interface TableState {
  readonly id: string;
  readonly name: string;
  readonly config: TableConfig;
  /** Fixed-length seat ring of size config.maxSeats; null indicates an empty seat */
  readonly seats: readonly (Player | null)[];
  readonly handNumber: number;
  readonly street: HandStreet;
  readonly blindLevelIndex: number;
  readonly dealerSeatIndex: SeatIndex | null;
  readonly smallBlindSeatIndex: SeatIndex | null;
  readonly bigBlindSeatIndex: SeatIndex | null;
  readonly actingSeatIndex: SeatIndex | null;
  readonly betting: StreetBettingState;
  readonly pots: readonly Pot[];
  readonly lastHandAwards: readonly PotAward[];
  readonly uncalledRefund: { readonly playerId: PlayerId; readonly amount: Chips } | null;
  readonly eliminations: readonly EliminationEntry[];
  readonly championPlayerId: PlayerId | null;
}
