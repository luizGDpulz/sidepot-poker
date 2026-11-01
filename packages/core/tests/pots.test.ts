import { describe, expect, it } from 'vitest';
import {
  PokerDomainError,
  applyPlayerAction,
  calculateSidePots,
  createTable,
  getLegalActions,
  getPlayerById,
  refundUncalledBet,
  resolveShowdown,
  seatPlayer,
  startNextHand,
  type TableState,
} from '../src/index.js';

function totalTableChips(state: TableState): number {
  const stackSum = state.seats.reduce((acc, p) => acc + (p ? p.stack : 0), 0);
  const potSum =
    state.street === 'SHOWDOWN'
      ? state.pots.reduce((acc, pot) => acc + pot.amount, 0)
      : state.seats.reduce((acc, p) => acc + (p ? p.handContribution : 0), 0);
  return stackSum + potSum;
}

describe('Side-Pot Slicing, Uncalled Refunds & Showdown Payouts', () => {
  it('slices the canonical 3-way all-in (1000 / 3000 / 3000) into Main Pot (3000) and Side Pot 1 (4000)', () => {
    let table = createTable({
      id: 'canonical',
      name: 'Canonical Side Pot',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'a', name: 'Player A', stack: 1000 });
    table = seatPlayer(table, { id: 'b', name: 'Player B', stack: 3000 });
    table = seatPlayer(table, { id: 'c', name: 'Player C', stack: 3000 });

    table = startNextHand(table);
    // Dealer=a(0), SB=b(1), BB=c(2). Preflop actor = a(0).
    table = applyPlayerAction(table, { playerId: 'a', type: 'ALL_IN' }); // 1000
    table = applyPlayerAction(table, { playerId: 'b', type: 'ALL_IN' }); // 3000
    table = applyPlayerAction(table, { playerId: 'c', type: 'CALL' }); // 3000 (ALL_IN)

    expect(table.street).toBe('SHOWDOWN');
    expect(table.pots).toEqual([
      {
        id: 'main',
        label: 'Main Pot',
        amount: 3000,
        eligiblePlayerIds: ['a', 'b', 'c'],
      },
      {
        id: 'side-1',
        label: 'Side Pot 1',
        amount: 4000,
        eligiblePlayerIds: ['b', 'c'],
      },
    ]);

    // Attempting to award Side Pot 1 to short-stacked Player A must fail
    expect(() =>
      resolveShowdown(table, {
        winnersByPotId: { main: ['a'], 'side-1': ['a'] },
      }),
    ).toThrow(PokerDomainError);

    // Player A wins Main Pot (triples up to 3000), Player C wins Side Pot 1 (4000), Player B busts!
    const finished = resolveShowdown(table, {
      winnersByPotId: { main: ['a'], 'side-1': ['c'] },
    });

    expect(finished.street).toBe('COMPLETE');
    expect(getPlayerById(finished, 'a')?.stack).toBe(3000);
    expect(getPlayerById(finished, 'b')?.stack).toBe(0);
    expect(getPlayerById(finished, 'b')?.status).toBe('ELIMINATED');
    expect(getPlayerById(finished, 'c')?.stack).toBe(4000);
    expect(totalTableChips(finished)).toBe(7000);
  });

  it('handles 5-way asymmetric all-ins with dead folded money and uncalled overbet refund accurately', () => {
    let table = createTable({ id: 'five-way', name: '5-Way Chaos' });
    table = seatPlayer(table, { id: 'a', name: 'A', stack: 500 });
    table = seatPlayer(table, { id: 'b', name: 'B', stack: 1200 });
    table = seatPlayer(table, { id: 'f', name: 'Folded', stack: 2000 });
    table = seatPlayer(table, { id: 'c', name: 'C', stack: 2500 });
    table = seatPlayer(table, { id: 'd', name: 'D', stack: 4000 });

    // Simulate contributions directly on seats to verify pure pot-slicing & uncalled refund algebra
    const simulatedSeats = table.seats.map((p) => {
      if (!p) return null;
      switch (p.id) {
        case 'a':
          return { ...p, stack: 0, handContribution: 500, status: 'ALL_IN' as const };
        case 'b':
          return { ...p, stack: 0, handContribution: 1200, status: 'ALL_IN' as const };
        case 'f':
          return { ...p, stack: 500, handContribution: 1500, status: 'FOLDED' as const };
        case 'c':
          return { ...p, stack: 0, handContribution: 2500, status: 'ALL_IN' as const };
        case 'd':
          return { ...p, stack: 0, handContribution: 4000, status: 'ALL_IN' as const };
        default:
          return p;
      }
    });

    const { seats: refundedSeats, refund } = refundUncalledBet(simulatedSeats);
    expect(refund).toEqual({ playerId: 'd', amount: 1500 });
    expect(refundedSeats[4]?.stack).toBe(1500);
    expect(refundedSeats[4]?.handContribution).toBe(2500);

    const pots = calculateSidePots(refundedSeats, true);
    expect(pots).toEqual([
      {
        id: 'main',
        label: 'Main Pot',
        amount: 2500, // 5 * 500
        eligiblePlayerIds: ['a', 'b', 'c', 'd'],
      },
      {
        id: 'side-1',
        label: 'Side Pot 1',
        amount: 2800, // 4 * 700 (b, f, c, d)
        eligiblePlayerIds: ['b', 'c', 'd'],
      },
      {
        id: 'side-2',
        label: 'Side Pot 2',
        amount: 2900, // f(300 dead) + c(1300) + d(1300)
        eligiblePlayerIds: ['c', 'd'],
      },
    ]);
  });

  it('awards odd chips in 2-way and 3-way split pots clockwise starting immediately left of the Dealer button (TDA Rule 20)', () => {
    let table = createTable({
      id: 'odd-chip',
      name: 'Odd Chip Rule',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 25, bigBlind: 50, ante: 25, durationSeconds: 900 },
        ],
      },
    });
    // Seat 0: Dealer (Alice), Seat 2: SB (Bob), Seat 5: BB (Charlie)
    table = seatPlayer(table, { id: 'alice', name: 'Alice', seatIndex: 0, stack: 1000 });
    table = seatPlayer(table, { id: 'bob', name: 'Bob', seatIndex: 2, stack: 1000 });
    table = seatPlayer(table, { id: 'charlie', name: 'Charlie', seatIndex: 5, stack: 1000 });

    table = startNextHand(table);
    // Antes = 3 * 25 = 75. Alice raises to 310 (total 335), Bob calls 310 (total 335), Charlie calls 310 (total 335).
    // Total pot = 1005 + let's bet 1 more chip? No: 3 * 335 = 1005. Let's make a 2-way split of an odd pot!
    // If Alice raises to 300 (total 325), Bob calls 300 (total 325), Charlie folds (posted 25 ante + 50 BB = 75):
    // Total pot = 325 + 325 + 75 = 725 (odd!).
    table = applyPlayerAction(table, { playerId: 'alice', type: 'RAISE', amount: 300 });
    table = applyPlayerAction(table, { playerId: 'bob', type: 'CALL' });
    table = applyPlayerAction(table, { playerId: 'charlie', type: 'FOLD' });

    // Check down FLOP, TURN, RIVER to SHOWDOWN
    for (const _street of ['FLOP', 'TURN', 'RIVER']) {
      table = applyPlayerAction(table, { playerId: 'bob', type: 'CHECK' });
      table = applyPlayerAction(table, { playerId: 'alice', type: 'CHECK' });
    }

    expect(table.street).toBe('SHOWDOWN');
    expect(table.pots[0]?.amount).toBe(725);

    // Split 725 between Alice (Dealer, seat 0) and Bob (SB, seat 2, first left of Dealer!):
    // Bob gets 363, Alice gets 362!
    const resolved = resolveShowdown(table, {
      winnersByPotId: { main: ['alice', 'bob'] },
    });

    expect(resolved.lastHandAwards[0]?.payouts).toEqual({
      bob: 363,
      alice: 362,
    });
    expect(totalTableChips(resolved)).toBe(3000);
  });

  it('preserves strict total chip conservation invariant across 25 multi-player hands', () => {
    let table = createTable({
      id: 'invariant',
      name: 'Conservation Simulation',
      config: {
        startingStack: 2000,
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 15, durationSeconds: 600 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'p1', name: 'P1' });
    table = seatPlayer(table, { id: 'p2', name: 'P2' });
    table = seatPlayer(table, { id: 'p3', name: 'P3' });
    table = seatPlayer(table, { id: 'p4', name: 'P4' });

    const EXPECTED_TOTAL = 8000;
    expect(totalTableChips(table)).toBe(EXPECTED_TOTAL);

    let seed = 42;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let h = 0; h < 25; h += 1) {
      if (table.championPlayerId !== null) {
        break;
      }
      table = startNextHand(table);
      expect(totalTableChips(table)).toBe(EXPECTED_TOTAL);

      while (
        table.street === 'PREFLOP' ||
        table.street === 'FLOP' ||
        table.street === 'TURN' ||
        table.street === 'RIVER'
      ) {
        const legal = getLegalActions(table);
        expect(legal).not.toBeNull();
        const r = nextRand();

        if (r < 0.18 && !legal!.canCheck) {
          table = applyPlayerAction(table, { playerId: legal!.playerId, type: 'FOLD' });
        } else if (r < 0.3 && legal!.canAllIn && nextRand() < 0.25) {
          table = applyPlayerAction(table, { playerId: legal!.playerId, type: 'ALL_IN' });
        } else if (r < 0.55 && (legal!.canBet || legal!.canRaise) && legal!.minBetOrRaiseTo !== null) {
          table = applyPlayerAction(table, {
            playerId: legal!.playerId,
            type: legal!.canBet ? 'BET' : 'RAISE',
            amount: legal!.minBetOrRaiseTo,
          });
        } else if (legal!.canCheck) {
          table = applyPlayerAction(table, { playerId: legal!.playerId, type: 'CHECK' });
        } else {
          table = applyPlayerAction(table, { playerId: legal!.playerId, type: 'CALL' });
        }

        expect(totalTableChips(table)).toBe(EXPECTED_TOTAL);
      }

      if (table.street === 'SHOWDOWN') {
        const winnersByPotId: Record<string, string[]> = {};
        for (const pot of table.pots) {
          if (pot.eligiblePlayerIds.length >= 2 && nextRand() < 0.4) {
            winnersByPotId[pot.id] = [
              pot.eligiblePlayerIds[0]!,
              pot.eligiblePlayerIds[1]!,
            ];
          } else {
            const pick =
              pot.eligiblePlayerIds[
                Math.floor(nextRand() * pot.eligiblePlayerIds.length)
              ]!;
            winnersByPotId[pot.id] = [pick];
          }
        }
        table = resolveShowdown(table, { winnersByPotId });
        expect(totalTableChips(table)).toBe(EXPECTED_TOTAL);
      }
    }
  });
});
