import type { BettingActionType, LegalActions } from './actions.js';
import type { LeaderboardEntry } from './tournament.js';
import type {
  Chips,
  HandStreet,
  PlayerId,
  SeatIndex,
  TableConfig,
  TableState,
} from './types.js';

export type SessionRole = 'HOST' | 'PLAYER' | 'DISPLAY' | 'APPLICANT';

export interface TableLogEntry {
  readonly id: string;
  readonly timestampMs: number;
  readonly handNumber: number;
  readonly street: HandStreet;
  readonly message: string;
}

export interface PendingJoinRequest {
  readonly requestId: string;
  readonly name: string;
  readonly avatar?: string;
  readonly requestedAtMs: number;
}

export interface BlindClockSnapshot {
  readonly isRunning: boolean;
  readonly remainingSeconds: number;
  readonly levelDurationSeconds: number;
  readonly updatedAtMs: number;
}

export interface PublicRoomSnapshot {
  readonly roomId: string;
  readonly isLocked: boolean;
  readonly hostPlayerId: PlayerId | null;
  readonly table: TableState;
  readonly legalActions: LegalActions | null;
  readonly leaderboard: readonly LeaderboardEntry[];
  readonly blindClock: BlindClockSnapshot;
  readonly canUndo: boolean;
  readonly connectedPlayerIds: readonly PlayerId[];
  readonly actionLog: readonly TableLogEntry[];
  readonly turnDeadlineMs: number | null;
}

export interface HostAdminOverlay {
  readonly inviteToken: string;
  readonly displayToken: string;
  readonly pendingJoinRequests: readonly PendingJoinRequest[];
}

export interface CreateRoomRequest {
  readonly tableName: string;
  readonly hostPlayerName?: string;
  readonly config?: Partial<TableConfig>;
}

export interface CreateRoomResponse {
  readonly roomId: string;
  readonly adminToken: string;
  readonly inviteToken: string;
  readonly displayToken: string;
  readonly hostPlayerId: PlayerId | null;
}

export interface JoinLobbyRequest {
  readonly inviteToken: string;
  readonly name: string;
  readonly avatar?: string;
}

export interface JoinLobbyResponse {
  readonly roomId: string;
  readonly requestId: string;
  readonly applicantToken: string;
}

export type ClientWsMessage =
  | { readonly type: 'ping' }
  | { readonly type: 'state:request_sync' }
  | {
      readonly type: 'game:action';
      readonly action: BettingActionType;
      readonly amount?: Chips;
    }
  | {
      readonly type: 'host:approve_join';
      readonly requestId: string;
      readonly seatIndex?: SeatIndex;
    }
  | {
      readonly type: 'host:reject_join';
      readonly requestId: string;
    }
  | {
      readonly type: 'host:seat_self';
      readonly name: string;
      readonly avatar?: string;
    }
  | {
      readonly type: 'host:set_locked';
      readonly isLocked: boolean;
    }
  | { readonly type: 'host:start_hand' }
  | {
      readonly type: 'host:resolve_showdown';
      readonly winnersByPotId: Readonly<Record<string, readonly PlayerId[]>>;
    }
  | { readonly type: 'host:undo' }
  | {
      readonly type: 'host:adjust_stack';
      readonly playerId: PlayerId;
      readonly newStack: Chips;
    }
  | { readonly type: 'host:rebuy'; readonly playerId: PlayerId }
  | { readonly type: 'host:addon'; readonly playerId: PlayerId }
  | { readonly type: 'host:kick_player'; readonly playerId: PlayerId }
  | { readonly type: 'host:force_skip_turn' }
  | {
      readonly type: 'host:set_sitting_out';
      readonly playerId: PlayerId;
      readonly sittingOut: boolean;
    }
  | {
      readonly type: 'host:set_action_timer';
      readonly actionTimeSeconds: number | null;
    }
  | { readonly type: 'host:toggle_clock'; readonly running: boolean }
  | { readonly type: 'host:advance_blind_level' };

export type ServerWsMessage =
  | { readonly type: 'pong'; readonly serverTimeMs: number }
  | {
      readonly type: 'auth:welcome';
      readonly role: SessionRole;
      readonly playerId: PlayerId | null;
    }
  | {
      readonly type: 'table:state_sync';
      readonly rehydrated: boolean;
      readonly snapshot: PublicRoomSnapshot;
    }
  | {
      readonly type: 'host:admin_sync';
      readonly admin: HostAdminOverlay;
    }
  | {
      readonly type: 'clock:level_up';
      readonly level: number;
      readonly smallBlind: Chips;
      readonly bigBlind: Chips;
      readonly ante: Chips;
    }
  | {
      readonly type: 'bouncer:approved';
      readonly requestId: string;
      readonly playerId: PlayerId;
      readonly sessionToken: string;
    }
  | {
      readonly type: 'bouncer:rejected';
      readonly requestId: string;
    }
  | {
      readonly type: 'error';
      readonly code: string;
      readonly message: string;
    };
