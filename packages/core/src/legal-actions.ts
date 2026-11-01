import type { LegalActions, RaisePresets } from './actions.js';
import { getCurrentBlindLevel } from './rotation.js';
import type { Chips, Player, PlayerId, TableState } from './types.js';

function clampPreset(
  candidate: Chips,
  minTo: Chips,
  maxTo: Chips,
): Chips | null {
  if (candidate < minTo || candidate > maxTo) {
    return null;
  }
  return candidate;
}

/**
 * Computes exact legal action bounds, call delta, minimum bet/raise target,
 * non-reopening raise lock, and 1-tap mobile raise presets for the acting player.
 */
export function getLegalActions(
  state: TableState,
  playerId?: PlayerId,
): LegalActions | null {
  if (
    state.street !== 'PREFLOP' &&
    state.street !== 'FLOP' &&
    state.street !== 'TURN' &&
    state.street !== 'RIVER'
  ) {
    return null;
  }

  if (state.actingSeatIndex === null) {
    return null;
  }

  const actingPlayer = state.seats[state.actingSeatIndex];
  if (!actingPlayer || actingPlayer.status !== 'ACTIVE' || actingPlayer.stack <= 0) {
    return null;
  }

  if (playerId !== undefined && actingPlayer.id !== playerId) {
    return null;
  }

  const { currentBet, minRaiseIncrement, fullRaiseCount } = state.betting;
  const maxBetOrRaiseTo = actingPlayer.streetBet + actingPlayer.stack;
  const rawCallNeeded = Math.max(0, currentBet - actingPlayer.streetBet);
  const callDelta = Math.min(actingPlayer.stack, rawCallNeeded);

  const canFold = true;
  const canCheck = actingPlayer.streetBet >= currentBet;
  const canCall = currentBet > actingPlayer.streetBet;

  const hasOpponentAbleToAct = state.seats.some(
    (p): p is Player =>
      p !== null &&
      p.id !== actingPlayer.id &&
      p.status === 'ACTIVE' &&
      p.stack > 0,
  );

  const raiseReopenedForPlayer =
    actingPlayer.lastActedFullRaiseCount === null ||
    actingPlayer.lastActedFullRaiseCount < fullRaiseCount;

  const aggressionAllowed = hasOpponentAbleToAct && raiseReopenedForPlayer;

  const minTarget =
    currentBet === 0 ? minRaiseIncrement : currentBet + minRaiseIncrement;

  const canBet =
    currentBet === 0 && aggressionAllowed && maxBetOrRaiseTo >= minTarget;
  const canRaise =
    currentBet > 0 && aggressionAllowed && maxBetOrRaiseTo >= minTarget;

  // ALL_IN is allowed either as an aggressive shove (when aggressionAllowed is true)
  // or as a short call when facing a bet larger than or equal to the player's remaining stack.
  const canAllIn = aggressionAllowed
    ? actingPlayer.stack > 0
    : canCall && maxBetOrRaiseTo <= currentBet;

  const minBetOrRaiseTo = canBet || canRaise ? minTarget : null;

  let presets: RaisePresets | null = null;
  if (minBetOrRaiseTo !== null) {
    const blindLevel = getCurrentBlindLevel(state);
    const totalCommitted = state.seats.reduce(
      (sum, p) => sum + (p ? p.handContribution : 0),
      0,
    );
    const potAfterCall = totalCommitted + callDelta;

    const baseForTwoPointFive =
      currentBet > 0 ? currentBet : blindLevel.bigBlind;
    const rawTwoPointFive = Math.round(baseForTwoPointFive * 2.5);
    const rawHalfPot = currentBet + Math.round(potAfterCall * 0.5);
    const rawFullPot = currentBet + potAfterCall;

    presets = {
      minTo: minBetOrRaiseTo,
      twoPointFiveXTo: clampPreset(
        rawTwoPointFive,
        minBetOrRaiseTo,
        maxBetOrRaiseTo,
      ),
      halfPotTo: clampPreset(rawHalfPot, minBetOrRaiseTo, maxBetOrRaiseTo),
      fullPotTo: clampPreset(rawFullPot, minBetOrRaiseTo, maxBetOrRaiseTo),
      allInTo: maxBetOrRaiseTo,
    };
  }

  return {
    playerId: actingPlayer.id,
    canFold,
    canCheck,
    canCall,
    callDelta,
    canBet,
    canRaise,
    canAllIn,
    minBetOrRaiseTo,
    maxBetOrRaiseTo,
    presets,
  };
}
