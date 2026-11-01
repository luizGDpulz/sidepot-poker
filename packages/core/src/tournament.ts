import { PokerDomainError } from './errors.js';
import { getCurrentBlindLevel } from './rotation.js';
import { DEFAULT_BLIND_SCHEDULE, getPlayerById, isHandActive } from './seating.js';
import type {
  BlindLevel,
  Chips,
  EliminationEntry,
  Player,
  PlayerId,
  TableState,
} from './types.js';

export const TURBO_BLIND_SCHEDULE: readonly BlindLevel[] = DEFAULT_BLIND_SCHEDULE.map(
  (lvl) => ({
    ...lvl,
    durationSeconds: 600,
  }),
);

export const STANDARD_BLIND_SCHEDULE: readonly BlindLevel[] = DEFAULT_BLIND_SCHEDULE;

export const DEEPSTACK_BLIND_SCHEDULE: readonly BlindLevel[] = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationSeconds: 1200 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 1200 },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 0, durationSeconds: 1200 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 1200 },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 25, durationSeconds: 1200 },
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationSeconds: 1200 },
  { level: 7, smallBlind: 250, bigBlind: 500, ante: 50, durationSeconds: 1200 },
  { level: 8, smallBlind: 300, bigBlind: 600, ante: 75, durationSeconds: 1200 },
  { level: 9, smallBlind: 400, bigBlind: 800, ante: 100, durationSeconds: 1200 },
  { level: 10, smallBlind: 500, bigBlind: 1000, ante: 100, durationSeconds: 1200 },
  { level: 11, smallBlind: 750, bigBlind: 1500, ante: 150, durationSeconds: 1200 },
  { level: 12, smallBlind: 1000, bigBlind: 2000, ante: 200, durationSeconds: 1200 },
];

export interface LeaderboardEntry {
  readonly rank: number;
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly chips: Chips;
  readonly isEliminated: boolean;
  readonly isChampion: boolean;
  readonly rebuyCount: number;
  readonly addOnCount: number;
  readonly eliminatedHandNumber: number | null;
}

export function setBlindLevelIndex(
  state: TableState,
  levelIndex: number,
): TableState {
  if (
    !Number.isSafeInteger(levelIndex) ||
    levelIndex < 0 ||
    levelIndex >= state.config.blindSchedule.length
  ) {
    throw new PokerDomainError(
      'INVALID_BLIND_LEVEL',
      `Blind level index ${String(levelIndex)} is out of bounds (0..${String(state.config.blindSchedule.length - 1)})`,
    );
  }
  return {
    ...state,
    blindLevelIndex: levelIndex,
  };
}

export function advanceBlindLevel(state: TableState): TableState {
  const maxIndex = state.config.blindSchedule.length - 1;
  if (state.blindLevelIndex >= maxIndex) {
    return state;
  }
  return {
    ...state,
    blindLevelIndex: state.blindLevelIndex + 1,
  };
}

export function rebuyPlayer(state: TableState, playerId: PlayerId): TableState {
  if (isHandActive(state)) {
    throw new PokerDomainError(
      'HAND_IN_PROGRESS',
      'Cannot process a rebuy while a hand is in progress',
    );
  }
  const isCashGame = state.config.gameMode === 'CASH';
  if (!isCashGame && !state.config.allowRebuys) {
    throw new PokerDomainError(
      'REBUY_NOT_ALLOWED',
      'Rebuys are disabled for this tournament',
    );
  }

  const currentLevel = getCurrentBlindLevel(state);
  if (!isCashGame && currentLevel.level > state.config.rebuyMaxLevel) {
    throw new PokerDomainError(
      'REBUY_NOT_ALLOWED',
      `Rebuy period ended after blind level ${String(state.config.rebuyMaxLevel)} (current level: ${String(currentLevel.level)})`,
    );
  }

  const player = getPlayerById(state, playerId);
  if (!player) {
    throw new PokerDomainError('PLAYER_NOT_FOUND', `Player "${playerId}" not found`);
  }
  if (player.stack > 0) {
    throw new PokerDomainError(
      'REBUY_NOT_ALLOWED',
      `Player "${playerId}" still has ${String(player.stack)} chips and cannot rebuy`,
    );
  }
  if (!isCashGame && player.rebuyCount >= state.config.maxRebuysPerPlayer) {
    throw new PokerDomainError(
      'REBUY_NOT_ALLOWED',
      `Player "${playerId}" has reached the maximum of ${String(state.config.maxRebuysPerPlayer)} rebuys`,
    );
  }

  const nextSeats: (Player | null)[] = state.seats.map((occupant) => {
    if (!occupant || occupant.id !== playerId) {
      return occupant;
    }
    return {
      ...occupant,
      stack: state.config.rebuyStack,
      startingHandStack: state.config.rebuyStack,
      status: 'WAITING',
      rebuyCount: occupant.rebuyCount + 1,
    };
  });

  const filteredEliminations = state.eliminations.filter(
    (entry) => entry.playerId !== playerId,
  );
  const liveCount = nextSeats.filter(
    (p): p is Player => p !== null && p.stack > 0 && p.status !== 'ELIMINATED',
  ).length;
  const totalEntrants = liveCount + filteredEliminations.length;

  const normalizedEliminations: EliminationEntry[] = filteredEliminations.map(
    (entry, idx) => ({
      ...entry,
      finishPosition: totalEntrants - idx,
    }),
  );

  return {
    ...state,
    seats: nextSeats,
    eliminations: normalizedEliminations,
    championPlayerId: null,
  };
}

export function addOnPlayer(state: TableState, playerId: PlayerId): TableState {
  if (isHandActive(state)) {
    throw new PokerDomainError(
      'HAND_IN_PROGRESS',
      'Cannot process an add-on while a hand is in progress',
    );
  }
  if (!state.config.allowAddOn) {
    throw new PokerDomainError(
      'ADDON_NOT_ALLOWED',
      'Add-ons are disabled for this tournament',
    );
  }

  const player = getPlayerById(state, playerId);
  if (!player) {
    throw new PokerDomainError('PLAYER_NOT_FOUND', `Player "${playerId}" not found`);
  }
  if (player.status === 'ELIMINATED' || player.stack <= 0) {
    throw new PokerDomainError(
      'ADDON_NOT_ALLOWED',
      `Eliminated player "${playerId}" must rebuy before taking an add-on`,
    );
  }
  if (player.addOnCount >= 1) {
    throw new PokerDomainError(
      'ADDON_NOT_ALLOWED',
      `Player "${playerId}" has already used their add-on`,
    );
  }

  const nextSeats: (Player | null)[] = state.seats.map((occupant) => {
    if (!occupant || occupant.id !== playerId) {
      return occupant;
    }
    const nextStack = occupant.stack + state.config.addOnStack;
    return {
      ...occupant,
      stack: nextStack,
      startingHandStack: nextStack,
      addOnCount: occupant.addOnCount + 1,
    };
  });

  return {
    ...state,
    seats: nextSeats,
  };
}

/**
 * Generates the complete live tournament standings (active chip leaders ranked 1..K,
 * followed by eliminated players ordered by chronological finish position).
 */
export function getTournamentLeaderboard(
  state: TableState,
): readonly LeaderboardEntry[] {
  const seatedPlayers = state.seats.filter((p): p is Player => p !== null);
  const playerMap = new Map<PlayerId, Player>(
    seatedPlayers.map((p) => [p.id, p]),
  );

  const livePlayers = seatedPlayers
    .filter((p) => p.status !== 'ELIMINATED' && p.stack + p.handContribution > 0)
    .sort((a, b) => {
      const aTotal = a.stack + a.handContribution;
      const bTotal = b.stack + b.handContribution;
      if (bTotal !== aTotal) {
        return bTotal - aTotal;
      }
      return a.seatIndex - b.seatIndex;
    });

  const liveEntries: LeaderboardEntry[] = livePlayers.map((p, index) => ({
    rank: index + 1,
    playerId: p.id,
    playerName: p.name,
    chips: p.stack + p.handContribution,
    isEliminated: false,
    isChampion: state.championPlayerId === p.id,
    rebuyCount: p.rebuyCount,
    addOnCount: p.addOnCount,
    eliminatedHandNumber: null,
  }));

  // Eliminations are recorded earliest-first (worst finishPosition first), so reverse for podium rank order
  const bustoutEntries: LeaderboardEntry[] = [...state.eliminations]
    .reverse()
    .map((elim, idx) => {
      const seated = playerMap.get(elim.playerId);
      return {
        rank: liveEntries.length + idx + 1,
        playerId: elim.playerId,
        playerName: elim.playerName,
        chips: 0,
        isEliminated: true,
        isChampion: false,
        rebuyCount: seated?.rebuyCount ?? 0,
        addOnCount: seated?.addOnCount ?? 0,
        eliminatedHandNumber: elim.handNumber,
      };
    });

  return [...liveEntries, ...bustoutEntries];
}
