import type { ShowdownResolutionInput } from './actions.js';
import { finalizeHandCompletion } from './betting.js';
import { PokerDomainError } from './errors.js';
import { getPlayerById } from './seating.js';
import type {
  Chips,
  Player,
  PlayerId,
  Pot,
  PotAward,
  SeatIndex,
  TableState,
} from './types.js';

/**
 * Computes clockwise seat priority starting immediately left of the Dealer button (0 = first left of button, maxSeats - 1 = dealer).
 * Implements official TDA Rule 20 for awarding odd chips in split pots.
 */
export function clockwiseOffsetLeftOfButton(
  seatIndex: SeatIndex,
  dealerSeatIndex: SeatIndex,
  maxSeats: number,
): number {
  return (((seatIndex - dealerSeatIndex - 1) % maxSeats) + maxSeats) % maxSeats;
}

export function distributeSinglePot(
  state: TableState,
  pot: Pot,
  winnerIds: readonly PlayerId[],
): PotAward {
  if (state.dealerSeatIndex === null) {
    throw new PokerDomainError(
      'NOT_IN_SHOWDOWN',
      'Cannot distribute pot without an active dealer seat index',
    );
  }

  const eligibleSet = new Set(pot.eligiblePlayerIds);
  const uniqueCheck = new Set<PlayerId>();
  const winnerPlayers: Player[] = [];

  for (const wId of winnerIds) {
    if (uniqueCheck.has(wId)) {
      throw new PokerDomainError(
        'INVALID_SHOWDOWN_WINNERS',
        `Duplicate winner "${wId}" specified for pot "${pot.id}"`,
      );
    }
    uniqueCheck.add(wId);

    if (!eligibleSet.has(wId)) {
      throw new PokerDomainError(
        'INVALID_SHOWDOWN_WINNERS',
        `Player "${wId}" is not eligible to win pot "${pot.id}"`,
      );
    }

    const player = getPlayerById(state, wId);
    if (!player) {
      throw new PokerDomainError(
        'PLAYER_NOT_FOUND',
        `Winning player "${wId}" not found at table`,
      );
    }
    winnerPlayers.push(player);
  }

  if (winnerPlayers.length === 0) {
    throw new PokerDomainError(
      'INVALID_SHOWDOWN_WINNERS',
      `At least one eligible winner must be specified for pot "${pot.id}"`,
    );
  }

  const dealerSeat = state.dealerSeatIndex;
  const maxSeats = state.config.maxSeats;

  const orderedWinners = [...winnerPlayers].sort(
    (a, b) =>
      clockwiseOffsetLeftOfButton(a.seatIndex, dealerSeat, maxSeats) -
      clockwiseOffsetLeftOfButton(b.seatIndex, dealerSeat, maxSeats),
  );

  const baseShare = Math.floor(pot.amount / orderedWinners.length);
  const oddRemainder = pot.amount % orderedWinners.length;

  const payouts: Record<PlayerId, Chips> = {};
  orderedWinners.forEach((winner, idx) => {
    payouts[winner.id] = baseShare + (idx < oddRemainder ? 1 : 0);
  });

  return {
    potId: pot.id,
    winnerIds: orderedWinners.map((w) => w.id),
    payouts,
  };
}

/**
 * Resolves Showdown by distributing Main Pot and all Side Pots to the Host-selected winners
 * (supporting multi-way split pots, TDA Rule 20 odd-chip distribution, and automatic single-contender pot resolution),
 * then records any player bustouts and tournament completion.
 */
export function resolveShowdown(
  state: TableState,
  input: ShowdownResolutionInput,
): TableState {
  if (state.street !== 'SHOWDOWN') {
    throw new PokerDomainError(
      'NOT_IN_SHOWDOWN',
      `Cannot resolve showdown while table is in street "${state.street}"`,
    );
  }

  const validPotIds = new Set(state.pots.map((p) => p.id));
  for (const key of Object.keys(input.winnersByPotId)) {
    if (!validPotIds.has(key)) {
      throw new PokerDomainError(
        'INVALID_SHOWDOWN_WINNERS',
        `Unknown pot ID "${key}" in showdown resolution`,
      );
    }
  }

  const totalGainsByPlayer = new Map<PlayerId, Chips>();
  const awards: PotAward[] = [];

  for (const pot of state.pots) {
    const providedWinners = input.winnersByPotId[pot.id];
    let effectiveWinners: readonly PlayerId[];

    if (pot.eligiblePlayerIds.length === 1) {
      const soleContender = pot.eligiblePlayerIds[0]!;
      effectiveWinners = providedWinners ?? [soleContender];
    } else {
      if (!providedWinners || providedWinners.length === 0) {
        throw new PokerDomainError(
          'INVALID_SHOWDOWN_WINNERS',
          `Missing winner selection for contested pot "${pot.id}" (${pot.label})`,
        );
      }
      effectiveWinners = providedWinners;
    }

    const award = distributeSinglePot(state, pot, effectiveWinners);
    awards.push(award);

    for (const [pId, amount] of Object.entries(award.payouts)) {
      totalGainsByPlayer.set(pId, (totalGainsByPlayer.get(pId) ?? 0) + amount);
    }
  }

  const awardedSeats = state.seats.map((occupant) => {
    if (!occupant) {
      return null;
    }
    const gained = totalGainsByPlayer.get(occupant.id) ?? 0;
    return {
      ...occupant,
      stack: occupant.stack + gained,
    };
  });

  return finalizeHandCompletion(
    state,
    awardedSeats,
    awards,
    state.uncalledRefund,
  );
}
