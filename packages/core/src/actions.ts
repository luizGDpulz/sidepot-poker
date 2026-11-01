import type { Chips, PlayerId } from './types.js';

export type BettingActionType =
  | 'FOLD'
  | 'CHECK'
  | 'CALL'
  | 'BET'
  | 'RAISE'
  | 'ALL_IN';

export type PlayerActionInput =
  | {
      readonly playerId: PlayerId;
      readonly type: 'FOLD' | 'CHECK' | 'CALL' | 'ALL_IN';
    }
  | {
      readonly playerId: PlayerId;
      readonly type: 'BET' | 'RAISE';
      /** Target total street wager ("bet to" / "raise to"), in integer chips */
      readonly amount: Chips;
    };

export interface RaisePresets {
  readonly minTo: Chips;
  readonly twoPointFiveXTo: Chips | null;
  readonly halfPotTo: Chips | null;
  readonly fullPotTo: Chips | null;
  readonly allInTo: Chips;
}

export interface LegalActions {
  readonly playerId: PlayerId;
  readonly canFold: boolean;
  readonly canCheck: boolean;
  readonly canCall: boolean;
  /** Additional chips required from player's stack to call the current bet */
  readonly callDelta: Chips;
  readonly canBet: boolean;
  readonly canRaise: boolean;
  readonly canAllIn: boolean;
  /** Minimum legal total street bet ("bet to" / "raise to") when canBet or canRaise is true */
  readonly minBetOrRaiseTo: Chips | null;
  /** Maximum total street bet (player.streetBet + player.stack) */
  readonly maxBetOrRaiseTo: Chips;
  readonly presets: RaisePresets | null;
}

export interface ShowdownResolutionInput {
  /** Mapping of potId -> one or more tied winning playerIds */
  readonly winnersByPotId: Readonly<Record<string, readonly PlayerId[]>>;
}
