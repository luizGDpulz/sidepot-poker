import {
  PokerDomainError,
  assertNonNegativeIntegerChips,
  assertPositiveIntegerChips,
} from './errors.js';
import type {
  BlindLevel,
  Chips,
  Player,
  PlayerId,
  SeatIndex,
  TableConfig,
  TableState,
} from './types.js';

export const DEFAULT_BLIND_SCHEDULE: readonly BlindLevel[] = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationSeconds: 900 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 0, durationSeconds: 900 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 0, durationSeconds: 900 },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 25, durationSeconds: 900 },
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationSeconds: 900 },
  { level: 7, smallBlind: 300, bigBlind: 600, ante: 75, durationSeconds: 900 },
  { level: 8, smallBlind: 500, bigBlind: 1000, ante: 100, durationSeconds: 900 },
  { level: 9, smallBlind: 1000, bigBlind: 2000, ante: 200, durationSeconds: 900 },
];

export const DEFAULT_TABLE_CONFIG: TableConfig = {
  gameMode: 'TOURNAMENT',
  actionTimeSeconds: null,
  maxSeats: 9,
  startingStack: 5000,
  blindSchedule: DEFAULT_BLIND_SCHEDULE,
  allowRebuys: true,
  maxRebuysPerPlayer: 2,
  rebuyMaxLevel: 4,
  rebuyStack: 5000,
  allowAddOn: true,
  addOnStack: 5000,
};

export interface CreateTableParams {
  readonly id: string;
  readonly name: string;
  readonly config?: Partial<TableConfig>;
}

export interface SeatPlayerParams {
  readonly id: PlayerId;
  readonly name: string;
  readonly avatar?: string;
  readonly seatIndex?: SeatIndex;
  readonly stack?: Chips;
}

export function validateTableConfig(config: TableConfig): void {
  if (!Number.isSafeInteger(config.maxSeats) || config.maxSeats < 2 || config.maxSeats > 10) {
    throw new PokerDomainError(
      'INVALID_CONFIG',
      `maxSeats must be an integer between 2 and 10 (received ${String(config.maxSeats)})`,
    );
  }
  assertPositiveIntegerChips(config.startingStack, 'startingStack');
  if (config.blindSchedule.length === 0) {
    throw new PokerDomainError('INVALID_CONFIG', 'blindSchedule cannot be empty');
  }
  for (const lvl of config.blindSchedule) {
    assertPositiveIntegerChips(lvl.smallBlind, `level ${String(lvl.level)} smallBlind`);
    assertPositiveIntegerChips(lvl.bigBlind, `level ${String(lvl.level)} bigBlind`);
    assertNonNegativeIntegerChips(lvl.ante, `level ${String(lvl.level)} ante`);
    if (lvl.bigBlind < lvl.smallBlind) {
      throw new PokerDomainError(
        'INVALID_CONFIG',
        `level ${String(lvl.level)} bigBlind (${String(lvl.bigBlind)}) must be >= smallBlind (${String(lvl.smallBlind)})`,
      );
    }
  }
  assertPositiveIntegerChips(config.rebuyStack, 'rebuyStack');
  assertPositiveIntegerChips(config.addOnStack, 'addOnStack');
}

export function createTable(params: CreateTableParams): TableState {
  const startingStack = params.config?.startingStack ?? DEFAULT_TABLE_CONFIG.startingStack;
  const config: TableConfig = {
    ...DEFAULT_TABLE_CONFIG,
    rebuyStack: startingStack,
    addOnStack: startingStack,
    ...params.config,
  };
  validateTableConfig(config);

  const firstLevel = config.blindSchedule[0];
  if (!firstLevel) {
    throw new PokerDomainError('INVALID_CONFIG', 'blindSchedule must contain at least one level');
  }

  return {
    id: params.id,
    name: params.name.trim() || 'Sidepot Table',
    config,
    seats: Array.from({ length: config.maxSeats }, () => null),
    handNumber: 0,
    street: 'IDLE',
    blindLevelIndex: 0,
    dealerSeatIndex: null,
    smallBlindSeatIndex: null,
    bigBlindSeatIndex: null,
    actingSeatIndex: null,
    betting: {
      currentBet: 0,
      lastFullRaiseBet: 0,
      minRaiseIncrement: firstLevel.bigBlind,
      fullRaiseCount: 0,
    },
    pots: [],
    lastHandAwards: [],
    uncalledRefund: null,
    eliminations: [],
    championPlayerId: null,
  };
}

export function isHandActive(state: TableState): boolean {
  return (
    state.street === 'PREFLOP' ||
    state.street === 'FLOP' ||
    state.street === 'TURN' ||
    state.street === 'RIVER' ||
    state.street === 'SHOWDOWN'
  );
}

export function getPlayerById(state: TableState, playerId: PlayerId): Player | null {
  for (const player of state.seats) {
    if (player && player.id === playerId) {
      return player;
    }
  }
  return null;
}

export function findNextSeatClockwise(
  seats: readonly (Player | null)[],
  fromSeatIndex: SeatIndex,
  predicate: (player: Player) => boolean,
): SeatIndex | null {
  const total = seats.length;
  if (total === 0) {
    return null;
  }
  for (let offset = 1; offset <= total; offset += 1) {
    const idx = (((fromSeatIndex + offset) % total) + total) % total;
    const occupant = seats[idx];
    if (occupant && predicate(occupant)) {
      return idx;
    }
  }
  return null;
}

export function getSeatsClockwiseFrom(
  seats: readonly (Player | null)[],
  startSeatInclusive: SeatIndex,
  predicate: (player: Player) => boolean,
): SeatIndex[] {
  const total = seats.length;
  const result: SeatIndex[] = [];
  for (let offset = 0; offset < total; offset += 1) {
    const idx = (((startSeatInclusive + offset) % total) + total) % total;
    const occupant = seats[idx];
    if (occupant && predicate(occupant)) {
      result.push(idx);
    }
  }
  return result;
}

export function isEligibleForNextHand(player: Player): boolean {
  return (
    player.stack > 0 &&
    player.status !== 'SITTING_OUT' &&
    player.status !== 'ELIMINATED'
  );
}

export function getEligibleHandSeats(state: TableState): SeatIndex[] {
  return getSeatsClockwiseFrom(state.seats, 0, isEligibleForNextHand);
}

export function seatPlayer(state: TableState, params: SeatPlayerParams): TableState {
  if (getPlayerById(state, params.id)) {
    throw new PokerDomainError(
      'DUPLICATE_PLAYER_ID',
      `Player "${params.id}" is already seated at the table`,
    );
  }

  const stack = params.stack ?? state.config.startingStack;
  assertPositiveIntegerChips(stack, 'player starting stack');

  let targetSeat: SeatIndex;
  if (params.seatIndex !== undefined) {
    if (
      !Number.isSafeInteger(params.seatIndex) ||
      params.seatIndex < 0 ||
      params.seatIndex >= state.config.maxSeats
    ) {
      throw new PokerDomainError(
        'INVALID_SEAT_INDEX',
        `Seat index ${String(params.seatIndex)} is outside valid range 0..${String(state.config.maxSeats - 1)}`,
      );
    }
    if (state.seats[params.seatIndex] !== null) {
      throw new PokerDomainError(
        'SEAT_OCCUPIED',
        `Seat ${String(params.seatIndex)} is already occupied`,
      );
    }
    targetSeat = params.seatIndex;
  } else {
    const firstEmpty = state.seats.findIndex((s) => s === null);
    if (firstEmpty === -1) {
      throw new PokerDomainError('SEAT_OCCUPIED', 'All seats at the table are occupied');
    }
    targetSeat = firstEmpty;
  }

  const newPlayer: Player = {
    id: params.id,
    name: params.name.trim() || params.id,
    ...(params.avatar !== undefined ? { avatar: params.avatar } : {}),
    seatIndex: targetSeat,
    stack,
    streetBet: 0,
    handContribution: 0,
    startingHandStack: stack,
    status: 'WAITING',
    lastActedFullRaiseCount: null,
    rebuyCount: 0,
    addOnCount: 0,
  };

  const nextSeats = state.seats.map((occupant, idx) =>
    idx === targetSeat ? newPlayer : occupant,
  );

  return {
    ...state,
    seats: nextSeats,
    championPlayerId: null,
  };
}

export function removePlayer(state: TableState, playerId: PlayerId): TableState {
  const player = getPlayerById(state, playerId);
  if (!player) {
    throw new PokerDomainError('PLAYER_NOT_FOUND', `Player "${playerId}" not found`);
  }

  if (
    isHandActive(state) &&
    (player.status === 'ACTIVE' || player.status === 'ALL_IN' || player.status === 'FOLDED')
  ) {
    throw new PokerDomainError(
      'HAND_IN_PROGRESS',
      `Cannot remove active hand participant "${playerId}" while hand is in progress`,
    );
  }

  const nextSeats = state.seats.map((occupant) =>
    occupant && occupant.id === playerId ? null : occupant,
  );

  return {
    ...state,
    seats: nextSeats,
  };
}

export function setPlayerSittingOut(
  state: TableState,
  playerId: PlayerId,
  sittingOut: boolean,
): TableState {
  const player = getPlayerById(state, playerId);
  if (!player) {
    throw new PokerDomainError('PLAYER_NOT_FOUND', `Player "${playerId}" not found`);
  }
  if (player.status === 'ELIMINATED') {
    throw new PokerDomainError(
      'ILLEGAL_ACTION',
      `Eliminated player "${playerId}" cannot toggle sitting out`,
    );
  }
  if (isHandActive(state) && (player.status === 'ACTIVE' || player.status === 'ALL_IN')) {
    throw new PokerDomainError(
      'HAND_IN_PROGRESS',
      `Cannot change sit-out status for "${playerId}" while participating in an active hand`,
    );
  }

  const nextStatus = sittingOut ? 'SITTING_OUT' : 'WAITING';
  const nextSeats = state.seats.map((occupant) =>
    occupant && occupant.id === playerId
      ? { ...occupant, status: nextStatus as Player['status'] }
      : occupant,
  );

  return {
    ...state,
    seats: nextSeats,
  };
}
