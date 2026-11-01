import { PokerDomainError } from './errors.js';
import {
  computeNextHandPositions,
  findFirstPreflopActor,
  getCurrentBlindLevel,
  isPlayerAbleToAct,
} from './rotation.js';
import { isEligibleForNextHand, isHandActive } from './seating.js';
import type { Chips, Player, Pot, SeatIndex, TableState } from './types.js';

/**
 * Computes a live preview of the pot(s) from current player handContributions.
 * Full side-pot slicing with uncalled refunds is finalized in pots.ts; this helper
 * ensures TableState.pots is always accurate right from blind/ante posting.
 */
export function buildLivePotsPreview(seats: readonly (Player | null)[]): Pot[] {
  const contributors = seats.filter(
    (p): p is Player => p !== null && p.handContribution > 0,
  );
  if (contributors.length === 0) {
    return [];
  }

  const contenders = contributors.filter((p) => p.status !== 'FOLDED');
  const maxContribution = Math.max(...contributors.map((p) => p.handContribution));

  const levelsSet = new Set<Chips>();
  for (const c of contenders) {
    if (c.handContribution > 0) {
      levelsSet.add(c.handContribution);
    }
  }
  levelsSet.add(maxContribution);

  const sortedLevels = [...levelsSet].sort((a, b) => a - b);
  const rawSlices: { amount: Chips; eligibleIds: string[] }[] = [];

  let prevCap = 0;
  for (const cap of sortedLevels) {
    let sliceAmount = 0;
    for (const p of contributors) {
      const delta = Math.max(0, Math.min(p.handContribution, cap) - prevCap);
      sliceAmount += delta;
    }

    if (sliceAmount > 0) {
      const eligibleIds = contenders
        .filter((p) => p.handContribution >= cap)
        .map((p) => p.id);

      const previousSlice = rawSlices[rawSlices.length - 1];
      if (
        previousSlice &&
        previousSlice.eligibleIds.length === eligibleIds.length &&
        previousSlice.eligibleIds.every((id, i) => id === eligibleIds[i])
      ) {
        previousSlice.amount += sliceAmount;
      } else {
        rawSlices.push({ amount: sliceAmount, eligibleIds });
      }
    }
    prevCap = cap;
  }

  return rawSlices.map((slice, index) => ({
    id: index === 0 ? 'main' : `side-${String(index)}`,
    label: index === 0 ? 'Main Pot' : `Side Pot ${String(index)}`,
    amount: slice.amount,
    eligiblePlayerIds: slice.eligibleIds,
  }));
}

/**
 * Refunds any uncalled excess chips from the single highest contributor above the second-highest contributor.
 */
export function applyUncalledBetRefund(seats: readonly (Player | null)[]): {
  readonly seats: readonly (Player | null)[];
  readonly refund: { readonly playerId: string; readonly amount: Chips } | null;
} {
  const contributors = seats.filter(
    (p): p is Player => p !== null && p.handContribution > 0,
  );
  if (contributors.length === 0) {
    return { seats, refund: null };
  }

  const sorted = [...contributors].sort(
    (a, b) => b.handContribution - a.handContribution,
  );
  const top = sorted[0];
  const secondHigh = sorted[1]?.handContribution ?? 0;

  if (!top || top.status === 'FOLDED' || top.handContribution <= secondHigh) {
    return { seats, refund: null };
  }

  const excess = top.handContribution - secondHigh;
  const nextSeats = seats.map((occupant) => {
    if (!occupant || occupant.id !== top.id) {
      return occupant;
    }
    const nextStack = occupant.stack + excess;
    return {
      ...occupant,
      stack: nextStack,
      streetBet: Math.max(0, occupant.streetBet - excess),
      handContribution: occupant.handContribution - excess,
      status:
        occupant.status === 'ALL_IN' && nextStack > 0 ? 'ACTIVE' : occupant.status,
    };
  });

  return {
    seats: nextSeats,
    refund: { playerId: top.id, amount: excess },
  };
}

/**
 * Starts the next hand: rotates Dealer/SB/BB, posts Antes and Blinds (with short-stack all-in handling),
 * and sets the first preflop actor (or transitions straight to SHOWDOWN if no further betting is possible).
 */
export function startNextHand(state: TableState): TableState {
  if (isHandActive(state)) {
    throw new PokerDomainError(
      'HAND_IN_PROGRESS',
      `Cannot start a new hand while hand #${String(state.handNumber)} is in street "${state.street}"`,
    );
  }
  if (state.championPlayerId !== null) {
    throw new PokerDomainError(
      'NOT_ENOUGH_PLAYERS',
      'Tournament has already concluded with a champion',
    );
  }

  const positions = computeNextHandPositions(state);
  const blindLevel = getCurrentBlindLevel(state);

  let maxPostedStreetBet = 0;

  const postedSeats: (Player | null)[] = state.seats.map((occupant, seatIdx) => {
    if (!occupant) {
      return null;
    }

    if (!isEligibleForNextHand(occupant)) {
      return {
        ...occupant,
        streetBet: 0,
        handContribution: 0,
        startingHandStack: occupant.stack,
        lastActedFullRaiseCount: null,
      };
    }

    let remaining = occupant.stack;
    const antePosted = Math.min(remaining, blindLevel.ante);
    remaining -= antePosted;

    let blindTarget = 0;
    if (seatIdx === positions.smallBlindSeatIndex) {
      blindTarget = blindLevel.smallBlind;
    } else if (seatIdx === positions.bigBlindSeatIndex) {
      blindTarget = blindLevel.bigBlind;
    }

    const blindPosted = Math.min(remaining, blindTarget);
    remaining -= blindPosted;

    if (blindPosted > maxPostedStreetBet) {
      maxPostedStreetBet = blindPosted;
    }

    return {
      ...occupant,
      stack: remaining,
      streetBet: blindPosted,
      handContribution: antePosted + blindPosted,
      startingHandStack: occupant.stack,
      status: remaining === 0 ? 'ALL_IN' : 'ACTIVE',
      lastActedFullRaiseCount: null,
    };
  });

  const ableToAct = postedSeats.filter(
    (p): p is Player => p !== null && isPlayerAbleToAct(p),
  );
  const soleActive = ableToAct.length === 1 ? ableToAct[0] : undefined;

  const noFurtherBettingPossible =
    ableToAct.length === 0 ||
    (soleActive !== undefined && soleActive.streetBet >= maxPostedStreetBet);

  if (noFurtherBettingPossible) {
    const { seats: refundedSeats, refund } = applyUncalledBetRefund(postedSeats);
    const finalPots = buildLivePotsPreview(refundedSeats);
    return {
      ...state,
      seats: refundedSeats,
      handNumber: state.handNumber + 1,
      street: 'SHOWDOWN',
      dealerSeatIndex: positions.dealerSeatIndex,
      smallBlindSeatIndex: positions.smallBlindSeatIndex,
      bigBlindSeatIndex: positions.bigBlindSeatIndex,
      actingSeatIndex: null,
      betting: {
        currentBet: 0,
        lastFullRaiseBet: 0,
        minRaiseIncrement: blindLevel.bigBlind,
        fullRaiseCount: 0,
      },
      pots: finalPots,
      lastHandAwards: [],
      uncalledRefund: refund,
    };
  }

  const actingSeatIndex: SeatIndex | null = findFirstPreflopActor(
    postedSeats,
    positions.bigBlindSeatIndex,
  );

  return {
    ...state,
    seats: postedSeats,
    handNumber: state.handNumber + 1,
    street: 'PREFLOP',
    dealerSeatIndex: positions.dealerSeatIndex,
    smallBlindSeatIndex: positions.smallBlindSeatIndex,
    bigBlindSeatIndex: positions.bigBlindSeatIndex,
    actingSeatIndex,
    betting: {
      currentBet: maxPostedStreetBet,
      lastFullRaiseBet: maxPostedStreetBet,
      minRaiseIncrement: blindLevel.bigBlind,
      fullRaiseCount: 0,
    },
    pots: buildLivePotsPreview(postedSeats),
    lastHandAwards: [],
    uncalledRefund: null,
  };
}
