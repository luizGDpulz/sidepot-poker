import { PokerDomainError } from './errors.js';
import { calculateSidePots, refundUncalledBet } from './pots.js';
import {
  computeNextHandPositions,
  findFirstPreflopActor,
  getCurrentBlindLevel,
  isPlayerAbleToAct,
} from './rotation.js';
import { isEligibleForNextHand, isHandActive } from './seating.js';
import type { Player, SeatIndex, TableState } from './types.js';

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
    const { seats: refundedSeats, refund } = refundUncalledBet(postedSeats);
    const finalPots = calculateSidePots(refundedSeats, true);
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
    pots: calculateSidePots(postedSeats, false),
    lastHandAwards: [],
    uncalledRefund: null,
  };
}
