import { PokerDomainError, assertNonNegativeIntegerChips } from './errors.js';
import { getPlayerById, isHandActive } from './seating.js';
import type {
  Chips,
  EliminationEntry,
  Player,
  PlayerId,
  TableState,
} from './types.js';

export const DEFAULT_MAX_HISTORY_DEPTH = 50;

export interface HistorySnapshot {
  readonly label: string;
  readonly state: TableState;
}

export interface TableHistoryState {
  readonly present: TableState;
  readonly past: readonly HistorySnapshot[];
  readonly maxDepth: number;
}

export interface ManualStackAdjustmentParams {
  readonly playerId: PlayerId;
  readonly newStack: Chips;
}

export function createTableHistory(
  initialState: TableState,
  maxDepth = DEFAULT_MAX_HISTORY_DEPTH,
): TableHistoryState {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new PokerDomainError(
      'INVALID_CONFIG',
      `maxDepth must be a positive integer (received ${String(maxDepth)})`,
    );
  }
  return {
    present: initialState,
    past: [],
    maxDepth,
  };
}

/**
 * Applies a pure domain transition and pushes the previous immutable TableState onto the bounded undo stack.
 * If the transition throws a PokerDomainError, the history remains unchanged.
 */
export function recordTableTransition(
  history: TableHistoryState,
  label: string,
  transition: (current: TableState) => TableState,
): TableHistoryState {
  const nextPresent = transition(history.present);
  if (nextPresent === history.present) {
    return history;
  }

  const appended = [...history.past, { label, state: history.present }];
  const boundedPast =
    appended.length > history.maxDepth
      ? appended.slice(appended.length - history.maxDepth)
      : appended;

  return {
    ...history,
    present: nextPresent,
    past: boundedPast,
  };
}

export function canUndoTableTransition(history: TableHistoryState): boolean {
  return history.past.length > 0;
}

export function undoTableTransition(history: TableHistoryState): {
  readonly history: TableHistoryState;
  readonly undoneLabel: string;
} {
  if (history.past.length === 0) {
    throw new PokerDomainError(
      'NOTHING_TO_UNDO',
      'No previous table state available to undo',
    );
  }

  const lastSnapshot = history.past[history.past.length - 1]!;
  const remainingPast = history.past.slice(0, -1);

  return {
    history: {
      ...history,
      present: lastSnapshot.state,
      past: remainingPast,
    },
    undoneLabel: lastSnapshot.label,
  };
}

/**
 * Allows the Host to manually set or correct a player's stack between hands,
 * automatically reconciling elimination / waiting status and podium rankings.
 */
export function adjustPlayerStackManually(
  state: TableState,
  params: ManualStackAdjustmentParams,
): TableState {
  if (isHandActive(state)) {
    throw new PokerDomainError(
      'HAND_IN_PROGRESS',
      'Cannot manually overwrite player stack mid-hand; undo the hand action or wait until hand completion',
    );
  }

  assertNonNegativeIntegerChips(params.newStack, 'newStack');

  const target = getPlayerById(state, params.playerId);
  if (!target) {
    throw new PokerDomainError(
      'PLAYER_NOT_FOUND',
      `Player "${params.playerId}" not found`,
    );
  }

  const nextSeats: (Player | null)[] = state.seats.map((occupant) => {
    if (!occupant || occupant.id !== params.playerId) {
      return occupant;
    }

    let nextStatus = occupant.status;
    if (params.newStack === 0) {
      nextStatus = 'ELIMINATED';
    } else if (occupant.status === 'ELIMINATED') {
      nextStatus = 'WAITING';
    }

    return {
      ...occupant,
      stack: params.newStack,
      startingHandStack: params.newStack,
      status: nextStatus,
    };
  });

  let updatedEliminations = state.eliminations.filter(
    (e) => e.playerId !== params.playerId,
  );

  if (params.newStack === 0) {
    updatedEliminations = [
      ...updatedEliminations,
      {
        playerId: target.id,
        playerName: target.name,
        handNumber: state.handNumber,
        finishPosition: 0,
        startingHandStack: target.stack,
      },
    ];
  }

  const livePlayers = nextSeats.filter(
    (p): p is Player => p !== null && p.stack > 0 && p.status !== 'ELIMINATED',
  );
  const totalEntrants = livePlayers.length + updatedEliminations.length;

  const normalizedEliminations: EliminationEntry[] = updatedEliminations.map(
    (entry, idx) => ({
      ...entry,
      finishPosition: totalEntrants - idx,
    }),
  );

  const championPlayerId =
    normalizedEliminations.length > 0 && livePlayers.length === 1
      ? (livePlayers[0]?.id ?? null)
      : null;

  return {
    ...state,
    seats: nextSeats,
    eliminations: normalizedEliminations,
    championPlayerId,
  };
}
