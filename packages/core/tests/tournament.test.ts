import { describe, expect, it } from 'vitest';
import {
  DEEPSTACK_BLIND_SCHEDULE,
  PokerDomainError,
  TURBO_BLIND_SCHEDULE,
  addOnPlayer,
  advanceBlindLevel,
  applyPlayerAction,
  createTable,
  forceSkipCurrentTurn,
  getCurrentBlindLevel,
  getTournamentLeaderboard,
  rebuyPlayer,
  resolveShowdown,
  seatPlayer,
  setBlindLevelIndex,
  startNextHand,
} from '../src/index.js';

describe('Tournament Blind Schedule, Rebuys, Add-ons & Elimination Leaderboard', () => {
  it('advances blind levels safely up to schedule maximum and validates explicit level indices', () => {
    let table = createTable({
      id: 'blinds',
      name: 'Blind Progression',
      config: { blindSchedule: TURBO_BLIND_SCHEDULE },
    });

    expect(getCurrentBlindLevel(table).level).toBe(1);
    table = advanceBlindLevel(table);
    expect(getCurrentBlindLevel(table).level).toBe(2);
    expect(getCurrentBlindLevel(table).bigBlind).toBe(100);

    table = setBlindLevelIndex(table, TURBO_BLIND_SCHEDULE.length - 1);
    expect(getCurrentBlindLevel(table).level).toBe(9);
    // Clamps safely at maximum level
    table = advanceBlindLevel(table);
    expect(getCurrentBlindLevel(table).level).toBe(9);

    expect(() => setBlindLevelIndex(table, 99)).toThrow(PokerDomainError);
    expect(DEEPSTACK_BLIND_SCHEDULE.length).toBe(12);
  });

  it('orders simultaneous multi-player bustouts by starting hand stack (TDA Rule 14) and crowns tournament champion', () => {
    let table = createTable({
      id: 'bustouts',
      name: 'Championship',
      config: {
        allowRebuys: false,
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'champ', name: 'Champ', stack: 5000 });
    table = seatPlayer(table, { id: 'mid', name: 'MidStack', stack: 1500 });
    table = seatPlayer(table, { id: 'tiny', name: 'TinyStack', stack: 800 });

    // Hand 1: All 3 go all-in, Champ scoops both Main Pot and Side Pot 1 -> double elimination!
    table = startNextHand(table);
    table = applyPlayerAction(table, { playerId: 'champ', type: 'ALL_IN' });
    table = applyPlayerAction(table, { playerId: 'mid', type: 'ALL_IN' });
    table = applyPlayerAction(table, { playerId: 'tiny', type: 'CALL' });

    expect(table.street).toBe('SHOWDOWN');
    table = resolveShowdown(table, {
      winnersByPotId: { main: ['champ'], 'side-1': ['champ'] },
    });

    expect(table.street).toBe('COMPLETE');
    expect(table.championPlayerId).toBe('champ');
    expect(table.eliminations).toEqual([
      {
        playerId: 'tiny',
        playerName: 'TinyStack',
        handNumber: 1,
        finishPosition: 3, // Smaller starting stack (800) finishes 3rd
        startingHandStack: 800,
      },
      {
        playerId: 'mid',
        playerName: 'MidStack',
        handNumber: 1,
        finishPosition: 2, // Larger starting stack (1500) finishes 2nd (runner-up)
        startingHandStack: 1500,
      },
    ]);

    const leaderboard = getTournamentLeaderboard(table);
    expect(leaderboard.map((e) => ({ rank: e.rank, id: e.playerId, champ: e.isChampion }))).toEqual([
      { rank: 1, id: 'champ', champ: true },
      { rank: 2, id: 'mid', champ: false },
      { rank: 3, id: 'tiny', champ: false },
    ]);

    // Cannot deal another hand once a champion is crowned
    expect(() => startNextHand(table)).toThrow(PokerDomainError);
  });

  it('supports player rebuys (including revoking premature champion status) and single add-ons within level cutoffs', () => {
    let table = createTable({
      id: 'rebuys',
      name: 'Rebuy Frenzy',
      config: {
        allowRebuys: true,
        maxRebuysPerPlayer: 1,
        rebuyMaxLevel: 2,
        rebuyStack: 3000,
        allowAddOn: true,
        addOnStack: 4000,
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 900 },
          { level: 2, smallBlind: 100, bigBlind: 200, ante: 0, durationSeconds: 900 },
          { level: 3, smallBlind: 200, bigBlind: 400, ante: 0, durationSeconds: 900 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'p1', name: 'Alice', stack: 2000 });
    table = seatPlayer(table, { id: 'p2', name: 'Bob', stack: 1000 });

    // Alice busts Bob in Hand 1
    table = startNextHand(table);
    table = applyPlayerAction(table, { playerId: 'p1', type: 'ALL_IN' });
    table = applyPlayerAction(table, { playerId: 'p2', type: 'CALL' });
    table = resolveShowdown(table, { winnersByPotId: { main: ['p1'] } });

    expect(table.championPlayerId).toBe('p1');

    // Bob immediately takes his 1 allowed rebuy -> tournament resumes!
    table = rebuyPlayer(table, 'p2');
    expect(table.championPlayerId).toBeNull();
    expect(table.eliminations).toHaveLength(0);
    expect(table.seats[1]?.stack).toBe(3000);
    expect(table.seats[1]?.rebuyCount).toBe(1);

    // Alice cannot rebuy while holding chips, but CAN take 1 add-on
    expect(() => rebuyPlayer(table, 'p1')).toThrow(PokerDomainError);
    table = addOnPlayer(table, 'p1');
    expect(table.seats[0]?.stack).toBe(7000);
    expect(() => addOnPlayer(table, 'p1')).toThrow(PokerDomainError);

    // Advance past rebuyMaxLevel (level 3 > max level 2) -> rebuys now closed even if busted
    table = setBlindLevelIndex(table, 2);
    table = startNextHand(table);
    table = applyPlayerAction(table, { playerId: 'p2', type: 'ALL_IN' });
    table = applyPlayerAction(table, { playerId: 'p1', type: 'CALL' });
    table = resolveShowdown(table, { winnersByPotId: { main: ['p1'] } });

    expect(() => rebuyPlayer(table, 'p2')).toThrow(PokerDomainError);
  });

  it('supports Cash Game / Fixed-Blinds mode without crowning a champion and allows force-skipping AFK turns', () => {
    let table = createTable({
      id: 'cash-1',
      name: 'Friday Cash Game',
      config: {
        gameMode: 'CASH',
        actionTimeSeconds: 30,
        startingStack: 1000,
        blindSchedule: [
          { level: 1, smallBlind: 10, bigBlind: 20, ante: 0, durationSeconds: 3600 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'p1', name: 'Alice', stack: 1000 });
    table = seatPlayer(table, { id: 'p2', name: 'Bob', stack: 1000 });

    table = startNextHand(table);
    // Force skip Alice's turn preflop (facing 20 BB with 10 SB -> must fold)
    const skipped = forceSkipCurrentTurn(table);
    expect(skipped.skippedPlayerId).toBe('p1');
    expect(skipped.actionTaken).toBe('FOLD');
    table = skipped.state;
    expect(table.street).toBe('COMPLETE');
    expect(table.championPlayerId).toBeNull();

    // Hand 2: All-in bustout in CASH mode never sets championPlayerId
    table = startNextHand(table);
    table = applyPlayerAction(table, { playerId: 'p2', type: 'ALL_IN' });
    table = applyPlayerAction(table, { playerId: 'p1', type: 'CALL' });
    table = resolveShowdown(table, { winnersByPotId: { main: ['p2'] } });
    expect(table.championPlayerId).toBeNull();

    // Unlimited rebuys in CASH mode
    table = rebuyPlayer(table, 'p1');
    expect(table.seats[0]?.stack).toBe(1000);
  });
});
