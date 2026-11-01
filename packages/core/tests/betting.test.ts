import { describe, expect, it } from 'vitest';
import {
  PokerDomainError,
  applyPlayerAction,
  createTable,
  getLegalActions,
  seatPlayer,
  startNextHand,
} from '../src/index.js';

describe('Street Betting State Machine & TDA Rule 47', () => {
  it('progresses cleanly across PREFLOP (including BB option), FLOP, TURN, RIVER and into SHOWDOWN', () => {
    let table = createTable({
      id: 't1',
      name: 'Full Street Hand',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'btn', name: 'Button', stack: 2000 });
    table = seatPlayer(table, { id: 'sb', name: 'Small', stack: 2000 });
    table = seatPlayer(table, { id: 'bb', name: 'Big', stack: 2000 });

    // PREFLOP: Dealer=btn(0), SB=sb(1)=50, BB=bb(2)=100 -> first actor = btn(0)
    table = startNextHand(table);
    expect(table.street).toBe('PREFLOP');
    expect(getLegalActions(table)?.playerId).toBe('btn');

    // Out-of-turn action rejected
    expect(() =>
      applyPlayerAction(table, { playerId: 'sb', type: 'CALL' }),
    ).toThrow(PokerDomainError);

    // BTN limps (calls 100), SB completes (calls 50 more -> 100), BB still gets the option!
    table = applyPlayerAction(table, { playerId: 'btn', type: 'CALL' });
    table = applyPlayerAction(table, { playerId: 'sb', type: 'CALL' });
    expect(table.street).toBe('PREFLOP');
    expect(getLegalActions(table)?.playerId).toBe('bb');
    expect(getLegalActions(table)?.canCheck).toBe(true);
    expect(getLegalActions(table)?.canRaise).toBe(true);

    // BB checks -> transitions to FLOP, SB acts first postflop
    table = applyPlayerAction(table, { playerId: 'bb', type: 'CHECK' });
    expect(table.street).toBe('FLOP');
    expect(getLegalActions(table)?.playerId).toBe('sb');

    // FLOP: SB bets 200, BB calls 200, BTN folds -> TURN
    table = applyPlayerAction(table, { playerId: 'sb', type: 'BET', amount: 200 });
    expect(() =>
      applyPlayerAction(table, { playerId: 'bb', type: 'CHECK' }),
    ).toThrow(PokerDomainError);
    table = applyPlayerAction(table, { playerId: 'bb', type: 'CALL' });
    table = applyPlayerAction(table, { playerId: 'btn', type: 'FOLD' });

    expect(table.street).toBe('TURN');
    expect(table.pots[0]?.amount).toBe(700);

    // TURN: SB checks, BB checks -> RIVER
    table = applyPlayerAction(table, { playerId: 'sb', type: 'CHECK' });
    table = applyPlayerAction(table, { playerId: 'bb', type: 'CHECK' });
    expect(table.street).toBe('RIVER');

    // RIVER: SB bets 300, under-min raise rejected, BB raises to 700 (+400), SB calls 700 -> SHOWDOWN
    table = applyPlayerAction(table, { playerId: 'sb', type: 'BET', amount: 300 });
    expect(() =>
      applyPlayerAction(table, { playerId: 'bb', type: 'RAISE', amount: 500 }),
    ).toThrow(PokerDomainError);

    table = applyPlayerAction(table, { playerId: 'bb', type: 'RAISE', amount: 700 });
    table = applyPlayerAction(table, { playerId: 'sb', type: 'CALL' });

    expect(table.street).toBe('SHOWDOWN');
    expect(table.actingSeatIndex).toBeNull();
    expect(table.pots).toEqual([
      {
        id: 'main',
        label: 'Main Pot',
        amount: 2100,
        eligiblePlayerIds: ['sb', 'bb'],
      },
    ]);
  });

  it('awards pot immediately and completes hand when all opponents fold (uncontested win)', () => {
    let table = createTable({
      id: 'fold-win',
      name: 'Uncontested',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'a', name: 'Alice', stack: 1000 });
    table = seatPlayer(table, { id: 'b', name: 'Bob', stack: 1000 });

    // Heads-up: Alice is Dealer+SB (25), Bob is BB (50). Alice raises to 150, Bob folds.
    table = startNextHand(table);
    table = applyPlayerAction(table, { playerId: 'a', type: 'RAISE', amount: 150 });
    table = applyPlayerAction(table, { playerId: 'b', type: 'FOLD' });

    expect(table.street).toBe('COMPLETE');
    expect(table.uncalledRefund).toEqual({ playerId: 'a', amount: 100 });
    expect(table.seats[0]?.stack).toBe(1050);
    expect(table.seats[1]?.stack).toBe(950);
    expect(table.lastHandAwards).toEqual([
      { potId: 'main', winnerIds: ['a'], payouts: { a: 100 } },
    ]);
  });

  it('enforces TDA Rule 47A: incomplete short all-in does NOT reopen raising or shoving for players who already acted', () => {
    let table = createTable({
      id: 'tda-47a',
      name: 'Short All-In Lock',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    // Seat 0: Dealer, Seat 1: SB, Seat 2: BB, Seat 3: UTG
    table = seatPlayer(table, { id: 'btn', name: 'BTN', stack: 420 }); // Short stack!
    table = seatPlayer(table, { id: 'sb', name: 'SB', stack: 3000 });
    table = seatPlayer(table, { id: 'bb', name: 'BB', stack: 3000 });
    table = seatPlayer(table, { id: 'utg', name: 'UTG', stack: 3000 });

    table = startNextHand(table);
    // UTG raises to 300 (minRaiseIncrement becomes 200)
    table = applyPlayerAction(table, { playerId: 'utg', type: 'RAISE', amount: 300 });
    // BTN goes ALL_IN for 420 (+120 < 200 minRaiseIncrement -> incomplete raise!)
    table = applyPlayerAction(table, { playerId: 'btn', type: 'ALL_IN' });

    // SB has NOT yet acted on UTG's 300 raise -> SB CAN still raise (min raise to 420 + 200 = 620)!
    const sbLegal = getLegalActions(table, 'sb');
    expect(sbLegal?.canRaise).toBe(true);
    expect(sbLegal?.minBetOrRaiseTo).toBe(620);

    // Suppose SB just calls 420 and BB folds -> action returns to UTG!
    table = applyPlayerAction(table, { playerId: 'sb', type: 'CALL' });
    table = applyPlayerAction(table, { playerId: 'bb', type: 'FOLD' });

    // UTG already acted at fullRaiseCount=1! UTG CANNOT raise OR shove all-in; UTG can ONLY fold or call 120!
    const utgLegal = getLegalActions(table, 'utg');
    expect(utgLegal?.playerId).toBe('utg');
    expect(utgLegal?.callDelta).toBe(120);
    expect(utgLegal?.canCall).toBe(true);
    expect(utgLegal?.canRaise).toBe(false);
    expect(utgLegal?.canAllIn).toBe(false);

    expect(() =>
      applyPlayerAction(table, { playerId: 'utg', type: 'RAISE', amount: 800 }),
    ).toThrow(PokerDomainError);
    expect(() =>
      applyPlayerAction(table, { playerId: 'utg', type: 'ALL_IN' }),
    ).toThrow(PokerDomainError);

    table = applyPlayerAction(table, { playerId: 'utg', type: 'CALL' });
    expect(table.street).toBe('FLOP');
  });

  it('enforces TDA Rule 47B: cumulative short all-ins reaching minRaiseIncrement DO reopen raising', () => {
    let table = createTable({
      id: 'tda-47b',
      name: 'Cumulative Short Shoves',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'btn', name: 'BTN', stack: 420 });
    table = seatPlayer(table, { id: 'sb', name: 'SB', stack: 510 }); // 460 left after 50 SB -> total 510
    table = seatPlayer(table, { id: 'bb', name: 'BB', stack: 3000 });
    table = seatPlayer(table, { id: 'utg', name: 'UTG', stack: 3000 });

    table = startNextHand(table);
    // UTG raises to 300 (increment = 200)
    table = applyPlayerAction(table, { playerId: 'utg', type: 'RAISE', amount: 300 });
    // BTN shoves 420 (+120)
    table = applyPlayerAction(table, { playerId: 'btn', type: 'ALL_IN' });
    // SB shoves 510 (+90, cumulative from 300 is +210 >= 200!)
    table = applyPlayerAction(table, { playerId: 'sb', type: 'ALL_IN' });
    // BB calls 510
    table = applyPlayerAction(table, { playerId: 'bb', type: 'CALL' });

    // Action returns to UTG: because cumulative increase (210) >= 200, raising IS reopened for UTG (min 510 + 200 = 710)!
    const utgLegal = getLegalActions(table, 'utg');
    expect(utgLegal?.canRaise).toBe(true);
    expect(utgLegal?.minBetOrRaiseTo).toBe(710);
    expect(utgLegal?.canAllIn).toBe(true);
  });

  it('computes mobile 1-tap raise presets within legal stack bounds', () => {
    let table = createTable({
      id: 'presets',
      name: 'Presets',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'a', name: 'Alice', stack: 5000 });
    table = seatPlayer(table, { id: 'b', name: 'Bob', stack: 5000 });

    table = startNextHand(table);
    const legal = getLegalActions(table, 'a');
    expect(legal?.presets).toEqual({
      minTo: 200,
      twoPointFiveXTo: 250,
      halfPotTo: 200,
      fullPotTo: 300,
      allInTo: 5000,
    });
  });
});
