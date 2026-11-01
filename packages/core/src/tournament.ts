import { PokerDomainError } from './errors.js';
import { DEFAULT_BLIND_SCHEDULE } from './seating.js';
import type { BlindLevel, TableState } from './types.js';

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
