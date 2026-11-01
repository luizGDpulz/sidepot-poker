import { describe, expect, it } from 'vitest';
import {
  PokerDomainError,
  createTable,
  findFirstPostflopActor,
  removePlayer,
  seatPlayer,
  setPlayerSittingOut,
  startNextHand,
} from '../src/index.js';

describe('Table Seating & Button/Blind Rotation', () => {
  it('validates table configuration bounds strictly', () => {
    expect(() =>
      createTable({ id: 't1', name: 'Bad Seats', config: { maxSeats: 1 } }),
    ).toThrow(PokerDomainError);

    expect(() =>
      createTable({
        id: 't1',
        name: 'Bad Blinds',
        config: {
          blindSchedule: [
            { level: 1, smallBlind: 100, bigBlind: 50, ante: 0, durationSeconds: 600 },
          ],
        },
      }),
    ).toThrow(PokerDomainError);
  });

  it('seats players sequentially or at explicit seats and rejects duplicates', () => {
    let table = createTable({ id: 't1', name: 'Friday Night' });
    table = seatPlayer(table, { id: 'p1', name: 'Alice' });
    table = seatPlayer(table, { id: 'p2', name: 'Bob', seatIndex: 4, stack: 8000 });
    table = seatPlayer(table, { id: 'p3', name: 'Charlie' });

    expect(table.seats[0]?.id).toBe('p1');
    expect(table.seats[0]?.stack).toBe(5000);
    expect(table.seats[4]?.id).toBe('p2');
    expect(table.seats[4]?.stack).toBe(8000);
    expect(table.seats[1]?.id).toBe('p3');

    expect(() => seatPlayer(table, { id: 'p1', name: 'Clone' })).toThrow(
      PokerDomainError,
    );
    expect(() =>
      seatPlayer(table, { id: 'p4', name: 'Dan', seatIndex: 4 }),
    ).toThrow(PokerDomainError);
  });

  it('rotates Dealer, SB, BB and UTG clockwise in a 4-handed ring while skipping empty and sitting-out seats', () => {
    let table = createTable({ id: 't1', name: 'Ring Game' });
    table = seatPlayer(table, { id: 'p0', name: 'Alice', seatIndex: 0 });
    table = seatPlayer(table, { id: 'p2', name: 'Bob', seatIndex: 2 });
    table = seatPlayer(table, { id: 'p5', name: 'Charlie', seatIndex: 5 });
    table = seatPlayer(table, { id: 'p7', name: 'Dana', seatIndex: 7 });
    table = seatPlayer(table, { id: 'p8', name: 'Eve', seatIndex: 8 });
    table = setPlayerSittingOut(table, 'p8', true);

    // Hand 1: Dealer=0, SB=2 (25), BB=5 (50), UTG=7
    const hand1 = startNextHand(table);
    expect(hand1.handNumber).toBe(1);
    expect(hand1.street).toBe('PREFLOP');
    expect(hand1.dealerSeatIndex).toBe(0);
    expect(hand1.smallBlindSeatIndex).toBe(2);
    expect(hand1.bigBlindSeatIndex).toBe(5);
    expect(hand1.actingSeatIndex).toBe(7);

    expect(hand1.seats[2]?.streetBet).toBe(25);
    expect(hand1.seats[2]?.stack).toBe(4975);
    expect(hand1.seats[5]?.streetBet).toBe(50);
    expect(hand1.seats[5]?.stack).toBe(4950);
    expect(hand1.seats[8]?.status).toBe('SITTING_OUT');
    expect(hand1.pots[0]?.amount).toBe(75);

    // Simulate hand 1 finishing so we can deal hand 2 and verify clockwise button advancement
    const betweenHands = { ...hand1, street: 'COMPLETE' as const };
    const hand2 = startNextHand(betweenHands);
    expect(hand2.dealerSeatIndex).toBe(2);
    expect(hand2.smallBlindSeatIndex).toBe(5);
    expect(hand2.bigBlindSeatIndex).toBe(7);
    expect(hand2.actingSeatIndex).toBe(0);
  });

  it('enforces official Heads-Up rules (Dealer posts Small Blind, acts first preflop and last postflop)', () => {
    let table = createTable({ id: 'hu', name: 'Heads-Up Match' });
    table = seatPlayer(table, { id: 'p1', name: 'Alice', seatIndex: 1 });
    table = seatPlayer(table, { id: 'p6', name: 'Bob', seatIndex: 6 });

    const hand1 = startNextHand(table);
    expect(hand1.dealerSeatIndex).toBe(1);
    expect(hand1.smallBlindSeatIndex).toBe(1);
    expect(hand1.bigBlindSeatIndex).toBe(6);
    // Preflop: Dealer/SB (seat 1) acts first
    expect(hand1.actingSeatIndex).toBe(1);
    // Postflop: BB/non-dealer (seat 6) acts first
    expect(findFirstPostflopActor(hand1.seats, hand1.dealerSeatIndex!)).toBe(6);

    const hand2 = startNextHand({ ...hand1, street: 'COMPLETE' });
    expect(hand2.dealerSeatIndex).toBe(6);
    expect(hand2.smallBlindSeatIndex).toBe(6);
    expect(hand2.bigBlindSeatIndex).toBe(1);
    expect(hand2.actingSeatIndex).toBe(6);
  });

  it('posts individual antes before blinds and auto-transitions to SHOWDOWN with uncalled refund when short stack is covered', () => {
    let table = createTable({
      id: 'short',
      name: 'Short Blind',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 600 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'shorty', name: 'Shorty', seatIndex: 0, stack: 60 });
    table = seatPlayer(table, { id: 'big', name: 'BigStack', seatIndex: 1, stack: 2000 });

    // Heads-Up: Shorty (seat 0) is Dealer+SB. Posts 25 ante + 35 toward SB = 60 ALL_IN.
    // BigStack (seat 1) posts 25 ante + 200 BB = 225. Uncalled 165 is refunded immediately!
    const hand = startNextHand(table);
    expect(hand.street).toBe('SHOWDOWN');
    expect(hand.actingSeatIndex).toBeNull();
    expect(hand.uncalledRefund).toEqual({ playerId: 'big', amount: 165 });
    expect(hand.seats[0]?.stack).toBe(0);
    expect(hand.seats[0]?.status).toBe('ALL_IN');
    expect(hand.seats[1]?.stack).toBe(1940);
    expect(hand.pots).toEqual([
      {
        id: 'main',
        label: 'Main Pot',
        amount: 120,
        eligiblePlayerIds: ['shorty', 'big'],
      },
    ]);
  });

  it('keeps PREFLOP open when SB still has a call/fold decision against a short all-in BB', () => {
    let table = createTable({
      id: 'short-bb',
      name: 'Short BB Decision',
      config: {
        blindSchedule: [
          { level: 1, smallBlind: 50, bigBlind: 100, ante: 0, durationSeconds: 600 },
        ],
      },
    });
    table = seatPlayer(table, { id: 'sb', name: 'SB Player', seatIndex: 0, stack: 1000 });
    table = seatPlayer(table, { id: 'bb', name: 'Short BB', seatIndex: 1, stack: 80 });

    const hand = startNextHand(table);
    expect(hand.street).toBe('PREFLOP');
    expect(hand.actingSeatIndex).toBe(0);
    expect(hand.betting.currentBet).toBe(80);
    expect(hand.seats[1]?.status).toBe('ALL_IN');
  });

  it('allows late player seating as WAITING mid-hand while blocking active participant removal', () => {
    let table = createTable({ id: 'mid', name: 'Mid Hand' });
    table = seatPlayer(table, { id: 'p1', name: 'Alice' });
    table = seatPlayer(table, { id: 'p2', name: 'Bob' });
    table = startNextHand(table);

    table = seatPlayer(table, { id: 'p3', name: 'Latecomer' });
    expect(table.seats[2]?.status).toBe('WAITING');

    expect(() => removePlayer(table, 'p1')).toThrow(PokerDomainError);
    table = removePlayer(table, 'p3');
    expect(table.seats[2]).toBeNull();
  });
});
