import { describe, expect, it } from 'vitest';
import {
  PokerDomainError,
  adjustPlayerStackManually,
  applyPlayerAction,
  canUndoTableTransition,
  createTable,
  createTableHistory,
  getPlayerById,
  recordTableTransition,
  resolveShowdown,
  seatPlayer,
  startNextHand,
  undoTableTransition,
} from '../src/index.js';

describe('Bounded Undo History Stack & Host Manual Stack Adjustments', () => {
  it('rolls back accidental folds, street transitions and showdown resolutions cleanly', () => {
    let base = createTable({ id: 'undo-test', name: 'Undo Table' });
    base = seatPlayer(base, { id: 'p1', name: 'Alice', stack: 2000 });
    base = seatPlayer(base, { id: 'p2', name: 'Bob', stack: 2000 });

    let history = createTableHistory(base, 10);
    expect(canUndoTableTransition(history)).toBe(false);
    expect(() => undoTableTransition(history)).toThrow(PokerDomainError);

    history = recordTableTransition(history, 'Start Hand #1', (s) => startNextHand(s));
    history = recordTableTransition(history, 'Alice ALL_IN', (s) =>
      applyPlayerAction(s, { playerId: 'p1', type: 'ALL_IN' }),
    );
    history = recordTableTransition(history, 'Bob accidental CALL', (s) =>
      applyPlayerAction(s, { playerId: 'p2', type: 'CALL' }),
    );
    expect(history.present.street).toBe('SHOWDOWN');

    history = recordTableTransition(history, 'Showdown p1 wins', (s) =>
      resolveShowdown(s, { winnersByPotId: { main: ['p1'] } }),
    );
    expect(history.present.championPlayerId).toBe('p1');

    // Host clicks Undo twice: reverses Showdown AND reverses Bob's accidental CALL!
    const undo1 = undoTableTransition(history);
    expect(undo1.undoneLabel).toBe('Showdown p1 wins');
    expect(undo1.history.present.street).toBe('SHOWDOWN');

    const undo2 = undoTableTransition(undo1.history);
    expect(undo2.undoneLabel).toBe('Bob accidental CALL');
    expect(undo2.history.present.street).toBe('PREFLOP');
    expect(getPlayerById(undo2.history.present, 'p2')?.stack).toBe(1950);
    expect(undo2.history.present.championPlayerId).toBeNull();
  });

  it('enforces bounded maxDepth window and leaves history untouched when a transition throws', () => {
    let base = createTable({ id: 'cap', name: 'Bounded Depth' });
    base = seatPlayer(base, { id: 'p1', name: 'Alice', stack: 3000 });
    base = seatPlayer(base, { id: 'p2', name: 'Bob', stack: 3000 });

    let history = createTableHistory(base, 2);
    history = recordTableTransition(history, 'Start Hand', (s) => startNextHand(s));
    history = recordTableTransition(history, 'Alice Call', (s) =>
      applyPlayerAction(s, { playerId: 'p1', type: 'CALL' }),
    );
    history = recordTableTransition(history, 'Bob Check', (s) =>
      applyPlayerAction(s, { playerId: 'p2', type: 'CHECK' }),
    );

    // Only the latest 2 snapshots are retained
    expect(history.past).toHaveLength(2);
    expect(history.past[0]?.label).toBe('Alice Call');
    expect(history.past[1]?.label).toBe('Bob Check');

    // Failed transition must not pollute history
    expect(() =>
      recordTableTransition(history, 'Illegal out-of-turn', (s) =>
        applyPlayerAction(s, { playerId: 'p1', type: 'CHECK' }),
      ),
    ).toThrow(PokerDomainError);
    expect(history.past).toHaveLength(2);
  });

  it('allows manual Host stack corrections between hands and reconciles elimination/champion states', () => {
    let table = createTable({ id: 'manual', name: 'Manual Correction' });
    table = seatPlayer(table, { id: 'p1', name: 'Alice', stack: 2000 });
    table = seatPlayer(table, { id: 'p2', name: 'Bob', stack: 2000 });

    const active = startNextHand(table);
    expect(() =>
      adjustPlayerStackManually(active, { playerId: 'p1', newStack: 5000 }),
    ).toThrow(PokerDomainError);

    // Zeroing Bob's stack between hands marks Bob eliminated and Alice champion
    table = adjustPlayerStackManually(table, { playerId: 'p2', newStack: 0 });
    expect(getPlayerById(table, 'p2')?.status).toBe('ELIMINATED');
    expect(table.championPlayerId).toBe('p1');

    // Restoring chips to Bob revives him as WAITING and clears premature champion status
    table = adjustPlayerStackManually(table, { playerId: 'p2', newStack: 1500 });
    expect(getPlayerById(table, 'p2')?.status).toBe('WAITING');
    expect(getPlayerById(table, 'p2')?.stack).toBe(1500);
    expect(table.eliminations).toHaveLength(0);
    expect(table.championPlayerId).toBeNull();
  });
});
