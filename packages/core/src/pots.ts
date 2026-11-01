import type { Chips, Player, Pot } from './types.js';

export interface UncalledRefundResult {
  readonly seats: readonly (Player | null)[];
  readonly refund: { readonly playerId: string; readonly amount: Chips } | null;
}

/**
 * Refunds any uncalled excess chips from the highest contributor above the second-highest contributor.
 */
export function refundUncalledBet(
  seats: readonly (Player | null)[],
): UncalledRefundResult {
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
 * Slices player handContributions into Main Pot and zero or more Side Pots.
 * - During active betting (`finalized = false`), only ALL_IN contenders create intermediate side-pot boundaries.
 * - At Showdown (`finalized = true`), every contender's final contribution boundary is evaluated.
 * - Adjacent slices with identical eligible contender sets (e.g., dead folded chips) are merged cleanly.
 */
export function calculateSidePots(
  seats: readonly (Player | null)[],
  finalized = false,
): Pot[] {
  const contributors = seats.filter(
    (p): p is Player => p !== null && p.handContribution > 0,
  );
  if (contributors.length === 0) {
    return [];
  }

  const nonFolded = seats.filter(
    (p): p is Player =>
      p !== null && (p.status === 'ACTIVE' || p.status === 'ALL_IN'),
  );
  const maxContribution = Math.max(...contributors.map((p) => p.handContribution));

  const levelsSet = new Set<Chips>();
  for (const c of nonFolded) {
    if (c.status === 'ALL_IN' && c.handContribution > 0) {
      levelsSet.add(c.handContribution);
    } else if (finalized && c.handContribution > 0) {
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
      const eligibleIds = nonFolded
        .filter((p) =>
          finalized || p.status === 'ALL_IN'
            ? p.handContribution >= cap
            : true,
        )
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
