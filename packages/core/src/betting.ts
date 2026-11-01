import type { PlayerActionInput } from './actions.js';
import { PokerDomainError, assertPositiveIntegerChips } from './errors.js';
import { getLegalActions } from './legal-actions.js';
import { calculateSidePots, refundUncalledBet } from './pots.js';
import {
  findFirstPostflopActor,
  getCurrentBlindLevel,
  isPlayerAbleToAct,
} from './rotation.js';
import { findNextSeatClockwise, getPlayerById } from './seating.js';
import type {
  Chips,
  EliminationEntry,
  HandStreet,
  Player,
  PotAward,
  StreetBettingState,
  TableState,
} from './types.js';

/**
 * Evaluates TDA Rule 47 (Re-Opening the Bet) for an ALL_IN wager:
 * - 47A: A single all-in raise < minRaiseIncrement does NOT reopen raising for players who already acted.
 * - 47B: Multiple consecutive short all-ins whose cumulative increase from lastFullRaiseBet reaches
 *        >= minRaiseIncrement DO reopen raising (keeping minRaiseIncrement unchanged unless a single shove exceeded it).
 */
export function resolveAllInBettingState(
  betting: StreetBettingState,
  targetStreetBet: Chips,
): StreetBettingState {
  if (targetStreetBet <= betting.currentBet) {
    return betting;
  }

  const singleIncrease = targetStreetBet - betting.currentBet;
  if (singleIncrease >= betting.minRaiseIncrement) {
    return {
      currentBet: targetStreetBet,
      lastFullRaiseBet: targetStreetBet,
      minRaiseIncrement: singleIncrease,
      fullRaiseCount: betting.fullRaiseCount + 1,
    };
  }

  const cumulativeIncrease = targetStreetBet - betting.lastFullRaiseBet;
  if (cumulativeIncrease >= betting.minRaiseIncrement) {
    return {
      currentBet: targetStreetBet,
      lastFullRaiseBet: targetStreetBet,
      minRaiseIncrement: betting.minRaiseIncrement,
      fullRaiseCount: betting.fullRaiseCount + 1,
    };
  }

  return {
    ...betting,
    currentBet: targetStreetBet,
  };
}

function nextStreetAfter(street: HandStreet): HandStreet {
  switch (street) {
    case 'PREFLOP':
      return 'FLOP';
    case 'FLOP':
      return 'TURN';
    case 'TURN':
      return 'RIVER';
    case 'RIVER':
      return 'SHOWDOWN';
    default:
      return 'SHOWDOWN';
  }
}

/**
 * Finalizes player statuses at the end of a completed hand:
 * - Marks 0-chip participants as ELIMINATED in TDA ranking order (shorter startingHandStack busts earlier, i.e., worse finishPosition).
 * - Resets remaining players to WAITING and detects tournament champion when 1 active stack remains.
 */
export function finalizeHandCompletion(
  state: TableState,
  updatedSeats: readonly (Player | null)[],
  awards: readonly PotAward[],
  uncalledRefund: { readonly playerId: string; readonly amount: Chips } | null,
): TableState {
  const newlyBusted: Player[] = [];
  for (const p of updatedSeats) {
    if (
      p &&
      p.stack === 0 &&
      p.status !== 'ELIMINATED' &&
      p.status !== 'SITTING_OUT' &&
      p.startingHandStack > 0
    ) {
      newlyBusted.push(p);
    }
  }

  // Players with chips remaining (including SITTING_OUT players who still hold chips)
  const survivingCount = updatedSeats.filter(
    (p): p is Player => p !== null && p.stack > 0 && p.status !== 'ELIMINATED',
  ).length;

  // TDA Rule 14: On simultaneous bustouts in the same hand, smaller startingHandStack receives worse placement
  // (e.g., if 2 players bust leaving 3 survivors, placements are 5th for smaller start stack and 4th for larger start stack).
  const sortedBusted = [...newlyBusted].sort(
    (a, b) => a.startingHandStack - b.startingHandStack,
  );

  const newEliminations: EliminationEntry[] = sortedBusted.map((busted, idx) => ({
    playerId: busted.id,
    playerName: busted.name,
    handNumber: state.handNumber,
    finishPosition: survivingCount + sortedBusted.length - idx,
    startingHandStack: busted.startingHandStack,
  }));

  const bustedIds = new Set(newlyBusted.map((p) => p.id));

  const cleanSeats: (Player | null)[] = updatedSeats.map((occupant) => {
    if (!occupant) {
      return null;
    }
    if (bustedIds.has(occupant.id)) {
      return {
        ...occupant,
        streetBet: 0,
        handContribution: 0,
        status: 'ELIMINATED' as const,
        lastActedFullRaiseCount: null,
      };
    }
    return {
      ...occupant,
      streetBet: 0,
      handContribution: 0,
      status:
        occupant.status === 'SITTING_OUT' || occupant.status === 'ELIMINATED'
          ? occupant.status
          : ('WAITING' as const),
      lastActedFullRaiseCount: null,
    };
  });

  const allEliminations = [...state.eliminations, ...newEliminations];
  const remainingWithChips = cleanSeats.filter(
    (p): p is Player => p !== null && p.stack > 0 && p.status !== 'ELIMINATED',
  );

  // Crown a champion only if at least one player has been eliminated and 1 survivor holds all chips
  const championPlayerId =
    allEliminations.length > 0 && remainingWithChips.length === 1
      ? (remainingWithChips[0]?.id ?? null)
      : null;

  return {
    ...state,
    seats: cleanSeats,
    street: 'COMPLETE',
    actingSeatIndex: null,
    pots: [],
    lastHandAwards: awards,
    uncalledRefund,
    eliminations: allEliminations,
    championPlayerId,
  };
}

function transitionToShowdown(
  state: TableState,
  seats: readonly (Player | null)[],
): TableState {
  const blindLevel = getCurrentBlindLevel(state);
  const { seats: refundedSeats, refund } = refundUncalledBet(seats);
  const cleanSeats = refundedSeats.map((p) =>
    p ? { ...p, streetBet: 0, lastActedFullRaiseCount: null } : null,
  );
  const finalPots = calculateSidePots(cleanSeats, true);

  return {
    ...state,
    seats: cleanSeats,
    street: 'SHOWDOWN',
    actingSeatIndex: null,
    betting: {
      currentBet: 0,
      lastFullRaiseBet: 0,
      minRaiseIncrement: blindLevel.bigBlind,
      fullRaiseCount: 0,
    },
    pots: finalPots,
    uncalledRefund: refund,
  };
}

export function applyPlayerAction(
  state: TableState,
  input: PlayerActionInput,
): TableState {
  if (
    state.street !== 'PREFLOP' &&
    state.street !== 'FLOP' &&
    state.street !== 'TURN' &&
    state.street !== 'RIVER'
  ) {
    throw new PokerDomainError(
      'HAND_NOT_IN_PROGRESS',
      `Cannot apply betting action during street "${state.street}"`,
    );
  }

  const existingPlayer = getPlayerById(state, input.playerId);
  if (!existingPlayer) {
    throw new PokerDomainError(
      'PLAYER_NOT_FOUND',
      `Player "${input.playerId}" is not seated at the table`,
    );
  }

  if (
    state.actingSeatIndex === null ||
    state.seats[state.actingSeatIndex]?.id !== input.playerId
  ) {
    throw new PokerDomainError(
      'NOT_PLAYERS_TURN',
      `It is not player "${input.playerId}"'s turn to act`,
    );
  }

  const actingPlayer = state.seats[state.actingSeatIndex];
  if (!actingPlayer) {
    throw new PokerDomainError('NOT_PLAYERS_TURN', 'Acting seat is empty');
  }

  const legal = getLegalActions(state, input.playerId);
  if (!legal) {
    throw new PokerDomainError(
      'ILLEGAL_ACTION',
      `No legal actions available for player "${input.playerId}"`,
    );
  }

  let nextBetting: StreetBettingState = state.betting;
  let updatedPlayer: Player;

  switch (input.type) {
    case 'FOLD': {
      updatedPlayer = {
        ...actingPlayer,
        status: 'FOLDED',
        lastActedFullRaiseCount: state.betting.fullRaiseCount,
      };
      break;
    }

    case 'CHECK': {
      if (!legal.canCheck) {
        throw new PokerDomainError(
          'ILLEGAL_ACTION',
          `Player "${input.playerId}" cannot check while facing a bet of ${String(state.betting.currentBet)}`,
        );
      }
      updatedPlayer = {
        ...actingPlayer,
        lastActedFullRaiseCount: state.betting.fullRaiseCount,
      };
      break;
    }

    case 'CALL': {
      if (!legal.canCall) {
        throw new PokerDomainError(
          'ILLEGAL_ACTION',
          `Player "${input.playerId}" has no bet to call`,
        );
      }
      const delta = legal.callDelta;
      const nextStack = actingPlayer.stack - delta;
      updatedPlayer = {
        ...actingPlayer,
        stack: nextStack,
        streetBet: actingPlayer.streetBet + delta,
        handContribution: actingPlayer.handContribution + delta,
        status: nextStack === 0 ? 'ALL_IN' : 'ACTIVE',
        lastActedFullRaiseCount: state.betting.fullRaiseCount,
      };
      break;
    }

    case 'BET':
    case 'RAISE': {
      const allowed = input.type === 'BET' ? legal.canBet : legal.canRaise;
      if (!allowed || legal.minBetOrRaiseTo === null) {
        throw new PokerDomainError(
          'ILLEGAL_ACTION',
          `Action "${input.type}" is not legal for player "${input.playerId}"`,
        );
      }
      assertPositiveIntegerChips(input.amount, `${input.type} amount`);
      if (
        input.amount < legal.minBetOrRaiseTo ||
        input.amount > legal.maxBetOrRaiseTo
      ) {
        throw new PokerDomainError(
          'INVALID_BET_AMOUNT',
          `${input.type} target ${String(input.amount)} must be between ${String(legal.minBetOrRaiseTo)} and ${String(legal.maxBetOrRaiseTo)}`,
        );
      }
      const delta = input.amount - actingPlayer.streetBet;
      const nextStack = actingPlayer.stack - delta;
      const raiseIncrement = input.amount - state.betting.currentBet;

      nextBetting = {
        currentBet: input.amount,
        lastFullRaiseBet: input.amount,
        minRaiseIncrement: raiseIncrement,
        fullRaiseCount: state.betting.fullRaiseCount + 1,
      };

      updatedPlayer = {
        ...actingPlayer,
        stack: nextStack,
        streetBet: input.amount,
        handContribution: actingPlayer.handContribution + delta,
        status: nextStack === 0 ? 'ALL_IN' : 'ACTIVE',
        lastActedFullRaiseCount: nextBetting.fullRaiseCount,
      };
      break;
    }

    case 'ALL_IN': {
      if (!legal.canAllIn) {
        throw new PokerDomainError(
          'ILLEGAL_ACTION',
          `ALL_IN is not legal for player "${input.playerId}"`,
        );
      }
      const delta = actingPlayer.stack;
      const targetStreetBet = actingPlayer.streetBet + delta;
      nextBetting = resolveAllInBettingState(state.betting, targetStreetBet);

      updatedPlayer = {
        ...actingPlayer,
        stack: 0,
        streetBet: targetStreetBet,
        handContribution: actingPlayer.handContribution + delta,
        status: 'ALL_IN',
        lastActedFullRaiseCount: nextBetting.fullRaiseCount,
      };
      break;
    }
  }

  const nextSeats = state.seats.map((occupant, idx) =>
    idx === actingPlayer.seatIndex ? updatedPlayer : occupant,
  );

  // 1. Check for uncontested win (everyone else folded)
  const contenders = nextSeats.filter(
    (p): p is Player =>
      p !== null && (p.status === 'ACTIVE' || p.status === 'ALL_IN'),
  );

  if (contenders.length === 1) {
    const soleWinner = contenders[0]!;
    const { seats: refundedSeats, refund } = refundUncalledBet(nextSeats);
    const totalPot = refundedSeats.reduce(
      (sum, p) => sum + (p ? p.handContribution : 0),
      0,
    );
    const awardedSeats = refundedSeats.map((p) =>
      p && p.id === soleWinner.id ? { ...p, stack: p.stack + totalPot } : p,
    );
    const award: PotAward = {
      potId: 'main',
      winnerIds: [soleWinner.id],
      payouts: { [soleWinner.id]: totalPot },
    };
    return finalizeHandCompletion(state, awardedSeats, [award], refund);
  }

  // 2. Check if no further betting is possible across the entire rest of the hand
  const ableToAct = nextSeats.filter(
    (p): p is Player => p !== null && isPlayerAbleToAct(p),
  );
  const soleActive = ableToAct.length === 1 ? ableToAct[0] : undefined;

  if (
    ableToAct.length === 0 ||
    (soleActive !== undefined && soleActive.streetBet >= nextBetting.currentBet)
  ) {
    return transitionToShowdown(state, nextSeats);
  }

  // 3. Check if another player still needs to act on the current street
  const nextActorSeat = findNextSeatClockwise(
    nextSeats,
    actingPlayer.seatIndex,
    (p) =>
      isPlayerAbleToAct(p) &&
      (p.lastActedFullRaiseCount === null || p.streetBet < nextBetting.currentBet),
  );

  if (nextActorSeat !== null) {
    return {
      ...state,
      seats: nextSeats,
      actingSeatIndex: nextActorSeat,
      betting: nextBetting,
      pots: calculateSidePots(nextSeats, false),
    };
  }

  // 4. Current street betting is complete -> advance to next street or SHOWDOWN
  const upcomingStreet = nextStreetAfter(state.street);
  if (upcomingStreet === 'SHOWDOWN') {
    return transitionToShowdown(state, nextSeats);
  }

  const blindLevel = getCurrentBlindLevel(state);
  const resetStreetSeats = nextSeats.map((p) =>
    p ? { ...p, streetBet: 0, lastActedFullRaiseCount: null } : null,
  );

  if (state.dealerSeatIndex === null) {
    throw new PokerDomainError('HAND_NOT_IN_PROGRESS', 'Missing dealer seat index');
  }

  const firstPostflopActor = findFirstPostflopActor(
    resetStreetSeats,
    state.dealerSeatIndex,
  );

  if (firstPostflopActor === null) {
    return transitionToShowdown(state, resetStreetSeats);
  }

  return {
    ...state,
    seats: resetStreetSeats,
    street: upcomingStreet,
    actingSeatIndex: firstPostflopActor,
    betting: {
      currentBet: 0,
      lastFullRaiseBet: 0,
      minRaiseIncrement: blindLevel.bigBlind,
      fullRaiseCount: 0,
    },
    pots: calculateSidePots(resetStreetSeats, false),
  };
}
