import {
  PokerDomainError,
  addOnPlayer,
  adjustPlayerStackManually,
  advanceBlindLevel,
  applyPlayerAction,
  canUndoTableTransition,
  createTable,
  createTableHistory,
  getCurrentBlindLevel,
  getLegalActions,
  getTournamentLeaderboard,
  rebuyPlayer,
  recordTableTransition,
  removePlayer,
  resolveShowdown,
  seatPlayer,
  startNextHand,
  undoTableTransition,
  type BettingActionType,
  type Chips,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type HostAdminOverlay,
  type JoinLobbyRequest,
  type JoinLobbyResponse,
  type PendingJoinRequest,
  type PlayerActionInput,
  type PlayerId,
  type PublicRoomSnapshot,
  type SeatIndex,
  type TableHistoryState,
} from '@sidepot/core';
import {
  createRoomSecurityStore,
  generateOpaqueToken,
  generateRoomId,
  issueApplicantToken,
  issuePlayerSessionToken,
  revokeApplicantTokenByRequestId,
  revokePlayerSessionTokens,
  validateInviteToken,
  type RoomSecurityStore,
} from './security.js';

export class ServerHttpError extends Error {
  public readonly statusCode: 400 | 401 | 403 | 404 | 409 | 429;
  public readonly errorCode: string;

  public constructor(
    statusCode: 400 | 401 | 403 | 404 | 409 | 429,
    errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerHttpError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export interface RoomInstance {
  readonly roomId: string;
  readonly security: RoomSecurityStore;
  history: TableHistoryState;
  hostPlayerId: PlayerId | null;
  isLocked: boolean;
  readonly pendingRequests: Map<string, PendingJoinRequest>;
  clockRunning: boolean;
  clockRemainingSeconds: number;
  clockUpdatedAtMs: number;
  readonly createdAtMs: number;
}

const MAX_PENDING_JOIN_REQUESTS = 30;

function sanitizeDisplayName(raw: string): string {
  const trimmed = raw.trim().slice(0, 28);
  if (trimmed.length === 0) {
    throw new ServerHttpError(400, 'INVALID_NAME', 'Player display name cannot be empty');
  }
  return trimmed;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomInstance>();

  public createRoom(input: CreateRoomRequest, nowMs = Date.now()): CreateRoomResponse {
    const roomId = generateRoomId();
    const security = createRoomSecurityStore();

    let table = createTable({
      id: roomId,
      name: input.tableName.trim().slice(0, 48) || 'Sidepot Live Table',
      ...(input.config !== undefined ? { config: input.config } : {}),
    });

    let hostPlayerId: PlayerId | null = null;
    if (input.hostPlayerName && input.hostPlayerName.trim().length > 0) {
      const hostName = sanitizeDisplayName(input.hostPlayerName);
      hostPlayerId = generateOpaqueToken('p', 6);
      table = seatPlayer(table, { id: hostPlayerId, name: hostName });
    }

    const firstLevel = getCurrentBlindLevel(table);

    const room: RoomInstance = {
      roomId,
      security,
      history: createTableHistory(table),
      hostPlayerId,
      isLocked: false,
      pendingRequests: new Map<string, PendingJoinRequest>(),
      clockRunning: false,
      clockRemainingSeconds: firstLevel.durationSeconds,
      clockUpdatedAtMs: nowMs,
      createdAtMs: nowMs,
    };

    this.rooms.set(roomId, room);

    return {
      roomId,
      adminToken: security.adminToken,
      inviteToken: security.inviteToken,
      displayToken: security.displayToken,
      hostPlayerId,
    };
  }

  public getRoom(roomId: string): RoomInstance | null {
    return this.rooms.get(roomId) ?? null;
  }

  public requireRoom(roomId: string): RoomInstance {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new ServerHttpError(404, 'ROOM_NOT_FOUND', `Room "${roomId}" does not exist`);
    }
    return room;
  }

  public getAllRooms(): IterableIterator<RoomInstance> {
    return this.rooms.values();
  }

  public requestJoinLobby(
    roomId: string,
    input: JoinLobbyRequest,
    nowMs = Date.now(),
  ): JoinLobbyResponse {
    const room = this.requireRoom(roomId);

    if (!validateInviteToken(room.security, input.inviteToken)) {
      throw new ServerHttpError(
        401,
        'UNAUTHORIZED_INVITE',
        'Valid room invite token is required to request table admission',
      );
    }

    if (room.isLocked) {
      throw new ServerHttpError(
        403,
        'ROOM_LOCKED',
        'The Host has locked this table against new entries',
      );
    }

    if (room.pendingRequests.size >= MAX_PENDING_JOIN_REQUESTS) {
      throw new ServerHttpError(
        429,
        'LOBBY_QUEUE_FULL',
        'Too many pending join requests; wait for Host review',
      );
    }

    const cleanName = sanitizeDisplayName(input.name);
    const requestId = generateOpaqueToken('req', 8);
    const applicantToken = issueApplicantToken(room.security, requestId);

    const request: PendingJoinRequest = {
      requestId,
      name: cleanName,
      ...(input.avatar !== undefined ? { avatar: input.avatar.slice(0, 16) } : {}),
      requestedAtMs: nowMs,
    };

    room.pendingRequests.set(requestId, request);

    return {
      roomId,
      requestId,
      applicantToken,
    };
  }

  public approveJoinRequest(
    roomId: string,
    requestId: string,
    seatIndex?: SeatIndex,
  ): { readonly playerId: PlayerId; readonly sessionToken: string } {
    const room = this.requireRoom(roomId);
    const pending = room.pendingRequests.get(requestId);
    if (!pending) {
      throw new ServerHttpError(
        404,
        'REQUEST_NOT_FOUND',
        `Join request "${requestId}" not found or already processed`,
      );
    }

    const playerId = generateOpaqueToken('p', 6);
    room.history = recordTableTransition(
      room.history,
      `Seat ${pending.name}`,
      (state) =>
        seatPlayer(state, {
          id: playerId,
          name: pending.name,
          ...(pending.avatar !== undefined ? { avatar: pending.avatar } : {}),
          ...(seatIndex !== undefined ? { seatIndex } : {}),
        }),
    );

    const sessionToken = issuePlayerSessionToken(room.security, playerId);
    room.pendingRequests.delete(requestId);
    revokeApplicantTokenByRequestId(room.security, requestId);

    return { playerId, sessionToken };
  }

  public rejectJoinRequest(roomId: string, requestId: string): void {
    const room = this.requireRoom(roomId);
    room.pendingRequests.delete(requestId);
    revokeApplicantTokenByRequestId(room.security, requestId);
  }

  public seatHostSelf(roomId: string, name: string, avatar?: string): PlayerId {
    const room = this.requireRoom(roomId);
    if (room.hostPlayerId !== null) {
      throw new ServerHttpError(
        409,
        'HOST_ALREADY_SEATED',
        'Host is already seated at the table',
      );
    }
    const cleanName = sanitizeDisplayName(name);
    const playerId = generateOpaqueToken('p', 6);
    room.history = recordTableTransition(
      room.history,
      `Seat Host ${cleanName}`,
      (state) =>
        seatPlayer(state, {
          id: playerId,
          name: cleanName,
          ...(avatar !== undefined ? { avatar: avatar.slice(0, 16) } : {}),
        }),
    );
    room.hostPlayerId = playerId;
    return playerId;
  }

  public setRoomLocked(roomId: string, isLocked: boolean): void {
    const room = this.requireRoom(roomId);
    room.isLocked = isLocked;
  }

  public dispatchPlayerAction(
    roomId: string,
    playerId: PlayerId,
    action: BettingActionType,
    amount?: Chips,
  ): void {
    const room = this.requireRoom(roomId);
    let actionInput: PlayerActionInput;

    if (action === 'BET' || action === 'RAISE') {
      if (amount === undefined) {
        throw new PokerDomainError(
          'INVALID_BET_AMOUNT',
          `Amount is required for ${action}`,
        );
      }
      actionInput = { playerId, type: action, amount };
    } else {
      actionInput = { playerId, type: action };
    }

    room.history = recordTableTransition(
      room.history,
      `${playerId}: ${action}`,
      (state) => applyPlayerAction(state, actionInput),
    );
  }

  public startHand(roomId: string, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    const wasFirstHand = room.history.present.handNumber === 0;
    room.history = recordTableTransition(
      room.history,
      `Start Hand #${String(room.history.present.handNumber + 1)}`,
      (state) => startNextHand(state),
    );
    if (wasFirstHand && !room.clockRunning) {
      room.clockRunning = true;
      room.clockUpdatedAtMs = nowMs;
    }
  }

  public resolveShowdown(
    roomId: string,
    winnersByPotId: Readonly<Record<string, readonly PlayerId[]>>,
  ): void {
    const room = this.requireRoom(roomId);
    room.history = recordTableTransition(
      room.history,
      `Showdown Hand #${String(room.history.present.handNumber)}`,
      (state) => resolveShowdown(state, { winnersByPotId }),
    );
  }

  public undo(roomId: string): string {
    const room = this.requireRoom(roomId);
    const result = undoTableTransition(room.history);
    room.history = result.history;
    return result.undoneLabel;
  }

  public adjustStack(roomId: string, playerId: PlayerId, newStack: Chips): void {
    const room = this.requireRoom(roomId);
    room.history = recordTableTransition(
      room.history,
      `Adjust ${playerId} -> ${String(newStack)}`,
      (state) => adjustPlayerStackManually(state, { playerId, newStack }),
    );
  }

  public rebuy(roomId: string, playerId: PlayerId): void {
    const room = this.requireRoom(roomId);
    room.history = recordTableTransition(
      room.history,
      `Rebuy ${playerId}`,
      (state) => rebuyPlayer(state, playerId),
    );
  }

  public addOn(roomId: string, playerId: PlayerId): void {
    const room = this.requireRoom(roomId);
    room.history = recordTableTransition(
      room.history,
      `Add-on ${playerId}`,
      (state) => addOnPlayer(state, playerId),
    );
  }

  public kickPlayer(roomId: string, playerId: PlayerId): void {
    const room = this.requireRoom(roomId);
    room.history = recordTableTransition(
      room.history,
      `Remove ${playerId}`,
      (state) => removePlayer(state, playerId),
    );
    revokePlayerSessionTokens(room.security, playerId);
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = null;
    }
  }

  public toggleBlindClock(
    roomId: string,
    running: boolean,
    nowMs = Date.now(),
  ): void {
    const room = this.requireRoom(roomId);
    if (room.clockRunning === running) {
      return;
    }
    if (!running) {
      const elapsedSeconds = Math.floor((nowMs - room.clockUpdatedAtMs) / 1000);
      room.clockRemainingSeconds = Math.max(
        0,
        room.clockRemainingSeconds - Math.max(0, elapsedSeconds),
      );
    }
    room.clockRunning = running;
    room.clockUpdatedAtMs = nowMs;
  }

  public forceAdvanceBlindLevel(roomId: string, nowMs = Date.now()): boolean {
    const room = this.requireRoom(roomId);
    const prevIdx = room.history.present.blindLevelIndex;
    const advanced = advanceBlindLevel(room.history.present);
    if (advanced.blindLevelIndex === prevIdx) {
      return false;
    }
    room.history = {
      ...room.history,
      present: advanced,
    };
    const nextLevel = getCurrentBlindLevel(advanced);
    room.clockRemainingSeconds = nextLevel.durationSeconds;
    room.clockUpdatedAtMs = nowMs;
    return true;
  }

  /**
   * Advances running blind clocks by elapsed wall-clock seconds.
   * Returns true if the room entered a new blind level on this tick.
   */
  public tickRoomClock(room: RoomInstance, nowMs = Date.now()): boolean {
    if (!room.clockRunning) {
      return false;
    }
    const elapsedSeconds = Math.floor((nowMs - room.clockUpdatedAtMs) / 1000);
    if (elapsedSeconds <= 0) {
      return false;
    }

    room.clockUpdatedAtMs += elapsedSeconds * 1000;
    room.clockRemainingSeconds = Math.max(
      0,
      room.clockRemainingSeconds - elapsedSeconds,
    );

    if (room.clockRemainingSeconds > 0) {
      return false;
    }

    const prevIdx = room.history.present.blindLevelIndex;
    const advanced = advanceBlindLevel(room.history.present);
    if (advanced.blindLevelIndex === prevIdx) {
      room.clockRunning = false;
      return false;
    }

    room.history = {
      ...room.history,
      present: advanced,
    };
    const nextLevel = getCurrentBlindLevel(advanced);
    room.clockRemainingSeconds = nextLevel.durationSeconds;
    return true;
  }

  public buildPublicSnapshot(
    room: RoomInstance,
    connectedPlayerIds: readonly PlayerId[],
  ): PublicRoomSnapshot {
    const table = room.history.present;
    const currentLevel = getCurrentBlindLevel(table);

    return {
      roomId: room.roomId,
      isLocked: room.isLocked,
      hostPlayerId: room.hostPlayerId,
      table,
      legalActions: getLegalActions(table),
      leaderboard: getTournamentLeaderboard(table),
      blindClock: {
        isRunning: room.clockRunning,
        remainingSeconds: room.clockRemainingSeconds,
        levelDurationSeconds: currentLevel.durationSeconds,
        updatedAtMs: room.clockUpdatedAtMs,
      },
      canUndo: canUndoTableTransition(room.history),
      connectedPlayerIds,
    };
  }

  public buildHostAdminOverlay(room: RoomInstance): HostAdminOverlay {
    return {
      inviteToken: room.security.inviteToken,
      displayToken: room.security.displayToken,
      pendingJoinRequests: [...room.pendingRequests.values()],
    };
  }
}
