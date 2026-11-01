import { PokerDomainError } from './errors.js';
import {
  findNextSeatClockwise,
  getEligibleHandSeats,
  isEligibleForNextHand,
} from './seating.js';
import type { BlindLevel, Player, SeatIndex, TableState } from './types.js';

export interface HandPositions {
  readonly isHeadsUp: boolean;
  readonly dealerSeatIndex: SeatIndex;
  readonly smallBlindSeatIndex: SeatIndex;
  readonly bigBlindSeatIndex: SeatIndex;
}

export function getCurrentBlindLevel(state: TableState): BlindLevel {
  const clampedIndex = Math.min(
    Math.max(0, state.blindLevelIndex),
    state.config.blindSchedule.length - 1,
  );
  const level = state.config.blindSchedule[clampedIndex];
  if (!level) {
    throw new PokerDomainError('INVALID_BLIND_LEVEL', 'Active blind level not found');
  }
  return level;
}

/**
 * Computes the next hand's Dealer, Small Blind, and Big Blind seat indices.
 * Enforces official TDA Heads-Up positioning (Dealer posts Small Blind).
 */
export function computeNextHandPositions(state: TableState): HandPositions {
  const eligibleSeats = getEligibleHandSeats(state);
  if (eligibleSeats.length < 2) {
    throw new PokerDomainError(
      'NOT_ENOUGH_PLAYERS',
      `At least 2 active players with chips are required to deal a hand (found ${String(eligibleSeats.length)})`,
    );
  }

  let dealerSeatIndex: SeatIndex;
  if (state.dealerSeatIndex === null) {
    const first = eligibleSeats[0];
    if (first === undefined) {
      throw new PokerDomainError('NOT_ENOUGH_PLAYERS', 'No eligible dealer seat found');
    }
    dealerSeatIndex = first;
  } else {
    const nextDealer = findNextSeatClockwise(
      state.seats,
      state.dealerSeatIndex,
      isEligibleForNextHand,
    );
    if (nextDealer === null) {
      throw new PokerDomainError('NOT_ENOUGH_PLAYERS', 'Could not advance dealer button');
    }
    dealerSeatIndex = nextDealer;
  }

  const isHeadsUp = eligibleSeats.length === 2;

  if (isHeadsUp) {
    const smallBlindSeatIndex = dealerSeatIndex;
    const bigBlindSeatIndex = findNextSeatClockwise(
      state.seats,
      dealerSeatIndex,
      isEligibleForNextHand,
    );
    if (bigBlindSeatIndex === null || bigBlindSeatIndex === smallBlindSeatIndex) {
      throw new PokerDomainError('NOT_ENOUGH_PLAYERS', 'Could not locate big blind seat in heads-up');
    }
    return {
      isHeadsUp: true,
      dealerSeatIndex,
      smallBlindSeatIndex,
      bigBlindSeatIndex,
    };
  }

  const smallBlindSeatIndex = findNextSeatClockwise(
    state.seats,
    dealerSeatIndex,
    isEligibleForNextHand,
  );
  if (smallBlindSeatIndex === null) {
    throw new PokerDomainError('NOT_ENOUGH_PLAYERS', 'Could not locate small blind seat');
  }

  const bigBlindSeatIndex = findNextSeatClockwise(
    state.seats,
    smallBlindSeatIndex,
    isEligibleForNextHand,
  );
  if (bigBlindSeatIndex === null) {
    throw new PokerDomainError('NOT_ENOUGH_PLAYERS', 'Could not locate big blind seat');
  }

  return {
    isHeadsUp: false,
    dealerSeatIndex,
    smallBlindSeatIndex,
    bigBlindSeatIndex,
  };
}

export function isPlayerAbleToAct(player: Player): boolean {
  return player.status === 'ACTIVE' && player.stack > 0;
}

/**
 * Preflop: first player able to act clockwise from the Big Blind (UTG in ring, Dealer/SB in heads-up).
 */
export function findFirstPreflopActor(
  seats: readonly (Player | null)[],
  bigBlindSeatIndex: SeatIndex,
): SeatIndex | null {
  return findNextSeatClockwise(seats, bigBlindSeatIndex, isPlayerAbleToAct);
}

/**
 * Postflop (Flop/Turn/River): first player able to act clockwise from the Dealer button.
 */
export function findFirstPostflopActor(
  seats: readonly (Player | null)[],
  dealerSeatIndex: SeatIndex,
): SeatIndex | null {
  return findNextSeatClockwise(seats, dealerSeatIndex, isPlayerAbleToAct);
}
