import {
  PokerDomainError,
  addOnPlayer,
  adjustPlayerStackManually,
  advanceBlindLevel,
  applyPlayerAction,
  canUndoTableTransition,
  createTable,
  createTableHistory,
  forceSkipCurrentTurn,
  getCurrentBlindLevel,
  getLegalActions,
  getPlayerById,
  getTournamentLeaderboard,
  isHandActive,
  rebuyPlayer,
  recordTableTransition,
  removePlayer,
  resolveShowdown,
  seatPlayer,
  setPlayerSittingOut,
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
  type TableLogEntry,
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
  readonly actionLog: TableLogEntry[];
  turnStartedAtMs: number | null;
  clockRunning: boolean;
  clockRemainingSeconds: number;
  clockUpdatedAtMs: number;
  readonly createdAtMs: number;
}

const MAX_PENDING_JOIN_REQUESTS = 30;
const MAX_ACTION_LOG_ENTRIES = 80;

function sanitizeDisplayName(raw: string): string {
  const trimmed = raw.trim().slice(0, 28);
  if (trimmed.length === 0) {
    throw new ServerHttpError(400, 'INVALID_NAME', 'Player display name cannot be empty');
  }
  return trimmed;
}

function appendRoomLog(room: RoomInstance, message: string, nowMs = Date.now()): void {
  const present = room.history.present;
  room.actionLog.push({
    id: generateOpaqueToken('log', 4),
    timestampMs: nowMs,
    handNumber: present.handNumber,
    street: present.street,
    message,
  });
  if (room.actionLog.length > MAX_ACTION_LOG_ENTRIES) {
    room.actionLog.splice(0, room.actionLog.length - MAX_ACTION_LOG_ENTRIES);
  }
}

function syncRoomTurnTimer(room: RoomInstance, nowMs = Date.now()): void {
  room.turnStartedAtMs =
    room.history.present.actingSeatIndex !== null ? nowMs : null;
}

function formatHandAwards(room: RoomInstance): string {
  const present = room.history.present;
  const parts: string[] = [];
  for (const award of present.lastHandAwards) {
    for (const [winnerId, payout] of Object.entries(award.payouts)) {
      const wName = getPlayerById(present, winnerId)?.name ?? winnerId;
      parts.push(`${wName} +${String(payout)}`);
    }
  }
  return parts.join(', ');
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
      actionLog: [],
      turnStartedAtMs: null,
      clockRunning: false,
      clockRemainingSeconds: firstLevel.durationSeconds,
      clockUpdatedAtMs: nowMs,
      createdAtMs: nowMs,
    };

    const modeTag = table.config.gameMode === 'CASH' ? 'Cash Game' : 'Tournament';
    appendRoomLog(room, `Table "${table.name}" created (${modeTag})`, nowMs);
    if (hostPlayerId) {
      const hostPlayer = getPlayerById(table, hostPlayerId);
      if (hostPlayer) {
        appendRoomLog(room, `${hostPlayer.name} seated at Seat #${String(hostPlayer.seatIndex + 1)}`, nowMs);
      }
    }

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

    const seatedPlayer = getPlayerById(room.history.present, playerId);
    appendRoomLog(
      room,
      `${pending.name} joined at Seat #${String((seatedPlayer?.seatIndex ?? 0) + 1)}`,
    );

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
    const seatedPlayer = getPlayerById(room.history.present, playerId);
    appendRoomLog(
      room,
      `${cleanName} (Host) seated at Seat #${String((seatedPlayer?.seatIndex ?? 0) + 1)}`,
    );
    return playerId;
  }

  public setRoomLocked(roomId: string, isLocked: boolean): void {
    const room = this.requireRoom(roomId);
    room.isLocked = isLocked;
    appendRoomLog(room, isLocked ? 'Table locked by Host' : 'Table unlocked by Host');
  }

  public dispatchPlayerAction(
    roomId: string,
    playerId: PlayerId,
    action: BettingActionType,
    amount?: Chips,
    nowMs = Date.now(),
  ): void {
    const room = this.requireRoom(roomId);
    const actorBefore = getPlayerById(room.history.present, playerId);
    const actorName = actorBefore?.name ?? playerId;
    const prevStreet = room.history.present.street;
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
      `${actorName}: ${action}`,
      (state) => applyPlayerAction(state, actionInput),
    );
    syncRoomTurnTimer(room, nowMs);

    const actorAfter = getPlayerById(room.history.present, playerId);
    const detailSuffix =
      action === 'BET' || action === 'RAISE'
        ? ` to ${String(amount)}`
        : action === 'CALL' || action === 'ALL_IN'
          ? ` (${String(actorAfter?.streetBet ?? 0)})`
          : '';
    appendRoomLog(room, `${actorName}: ${action}${detailSuffix}`, nowMs);

    const nextStreet = room.history.present.street;
    if (nextStreet !== prevStreet) {
      if (nextStreet === 'COMPLETE') {
        const awardsSummary = formatHandAwards(room);
        if (awardsSummary) {
          appendRoomLog(room, `Hand #${String(room.history.present.handNumber)} won: ${awardsSummary}`, nowMs);
        }
      } else {
        appendRoomLog(room, `Board advanced to ${nextStreet}`, nowMs);
      }
    }
  }

  public startHand(roomId: string, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    const wasFirstHand = room.history.present.handNumber === 0;
    room.history = recordTableTransition(
      room.history,
      `Start Hand #${String(room.history.present.handNumber + 1)}`,
      (state) => startNextHand(state),
    );
    syncRoomTurnTimer(room, nowMs);
    const isCash = room.history.present.config.gameMode === 'CASH';
    if (wasFirstHand && !room.clockRunning && !isCash) {
      room.clockRunning = true;
      room.clockUpdatedAtMs = nowMs;
    }
    const lvl = getCurrentBlindLevel(room.history.present);
    appendRoomLog(
      room,
      `Hand #${String(room.history.present.handNumber)} started — Blinds ${String(lvl.smallBlind)}/${String(lvl.bigBlind)}`,
      nowMs,
    );
  }

  public resolveShowdown(
    roomId: string,
    winnersByPotId: Readonly<Record<string, readonly PlayerId[]>>,
    nowMs = Date.now(),
  ): void {
    const room = this.requireRoom(roomId);
    room.history = recordTableTransition(
      room.history,
      `Showdown Hand #${String(room.history.present.handNumber)}`,
      (state) => resolveShowdown(state, { winnersByPotId }),
    );
    syncRoomTurnTimer(room, nowMs);
    const awardsSummary = formatHandAwards(room);
    appendRoomLog(
      room,
      `Showdown Hand #${String(room.history.present.handNumber)}: ${awardsSummary || 'Complete'}`,
      nowMs,
    );
  }

  public undo(roomId: string, nowMs = Date.now()): string {
    const room = this.requireRoom(roomId);
    const result = undoTableTransition(room.history);
    room.history = result.history;
    syncRoomTurnTimer(room, nowMs);
    appendRoomLog(room, `Undo: ${result.undoneLabel}`, nowMs);
    return result.undoneLabel;
  }

  public adjustStack(roomId: string, playerId: PlayerId, newStack: Chips, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    const pName = getPlayerById(room.history.present, playerId)?.name ?? playerId;
    room.history = recordTableTransition(
      room.history,
      `Adjust ${pName} -> ${String(newStack)}`,
      (state) => adjustPlayerStackManually(state, { playerId, newStack }),
    );
    appendRoomLog(room, `Stack adjusted: ${pName} -> ${String(newStack)}`, nowMs);
  }

  public rebuy(roomId: string, playerId: PlayerId, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    const pName = getPlayerById(room.history.present, playerId)?.name ?? playerId;
    room.history = recordTableTransition(
      room.history,
      `Rebuy ${pName}`,
      (state) => rebuyPlayer(state, playerId),
    );
    appendRoomLog(
      room,
      `Re-buy: ${pName} (+${String(room.history.present.config.rebuyStack)})`,
      nowMs,
    );
  }

  public addOn(roomId: string, playerId: PlayerId, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    const pName = getPlayerById(room.history.present, playerId)?.name ?? playerId;
    room.history = recordTableTransition(
      room.history,
      `Add-on ${pName}`,
      (state) => addOnPlayer(state, playerId),
    );
    appendRoomLog(
      room,
      `Add-on: ${pName} (+${String(room.history.present.config.addOnStack)})`,
      nowMs,
    );
  }

  public kickPlayer(roomId: string, playerId: PlayerId, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    const pName = getPlayerById(room.history.present, playerId)?.name ?? playerId;
    room.history = recordTableTransition(
      room.history,
      `Remove ${pName}`,
      (state) => removePlayer(state, playerId),
    );
    revokePlayerSessionTokens(room.security, playerId);
    if (room.hostPlayerId === playerId) {
      room.hostPlayerId = null;
    }
    syncRoomTurnTimer(room, nowMs);
    appendRoomLog(room, `${pName} removed from table`, nowMs);
  }

  public forceSkipTurn(roomId: string, nowMs = Date.now()): void {
    const room = this.requireRoom(roomId);
    let skippedName = '';
    let skippedAction: 'CHECK' | 'FOLD' = 'FOLD';
    room.history = recordTableTransition(
      room.history,
      'Host Skip Turn',
      (state) => {
        const res = forceSkipCurrentTurn(state);
        skippedName = getPlayerById(state, res.skippedPlayerId)?.name ?? res.skippedPlayerId;
        skippedAction = res.actionTaken;
        return res.state;
      },
    );
    syncRoomTurnTimer(room, nowMs);
    appendRoomLog(room, `AFK Skip: ${skippedName} (${skippedAction})`, nowMs);
  }

  public setSittingOut(
    roomId: string,
    playerId: PlayerId,
    sittingOut: boolean,
    nowMs = Date.now(),
  ): void {
    const room = this.requireRoom(roomId);
    const pName = getPlayerById(room.history.present, playerId)?.name ?? playerId;
    room.history = recordTableTransition(
      room.history,
      `${pName}: ${sittingOut ? 'Sit Out' : 'Sit In'}`,
      (state) => {
        let nextState = state;
        const target = getPlayerById(nextState, playerId);
        if (
          sittingOut &&
          target &&
          isHandActive(nextState) &&
          nextState.actingSeatIndex === target.seatIndex
        ) {
          nextState = forceSkipCurrentTurn(nextState).state;
        }
        return setPlayerSittingOut(nextState, playerId, sittingOut);
      },
    );
    syncRoomTurnTimer(room, nowMs);
    appendRoomLog(
      room,
      `${pName} is now ${sittingOut ? 'Sitting Out (AFK)' : 'Active'}`,
      nowMs,
    );
  }

  public setActionTimer(
    roomId: string,
    actionTimeSeconds: number | null,
    nowMs = Date.now(),
  ): void {
    const room = this.requireRoom(roomId);
    if (
      actionTimeSeconds !== null &&
      (!Number.isSafeInteger(actionTimeSeconds) ||
        actionTimeSeconds < 5 ||
        actionTimeSeconds > 300)
    ) {
      throw new PokerDomainError(
        'INVALID_CONFIG',
        'actionTimeSeconds must be null or an integer between 5 and 300 seconds',
      );
    }
    room.history = {
      ...room.history,
      present: {
        ...room.history.present,
        config: {
          ...room.history.present.config,
          actionTimeSeconds,
        },
      },
    };
    syncRoomTurnTimer(room, nowMs);
    appendRoomLog(
      room,
      `Turn Shot Clock: ${actionTimeSeconds ? `${String(actionTimeSeconds)}s` : 'Off'}`,
      nowMs,
    );
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
    appendRoomLog(room, running ? 'Tournament clock resumed' : 'Tournament clock paused', nowMs);
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
    appendRoomLog(
      room,
      `Level Up -> Level ${String(nextLevel.level)} (${String(nextLevel.smallBlind)}/${String(nextLevel.bigBlind)})`,
      nowMs,
    );
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
    appendRoomLog(
      room,
      `Level Up -> Level ${String(nextLevel.level)} (${String(nextLevel.smallBlind)}/${String(nextLevel.bigBlind)})`,
      nowMs,
    );
    return true;
  }

  public buildPublicSnapshot(
    room: RoomInstance,
    connectedPlayerIds: readonly PlayerId[],
  ): PublicRoomSnapshot {
    const table = room.history.present;
    const currentLevel = getCurrentBlindLevel(table);
    const actionTimeSeconds = table.config.actionTimeSeconds ?? null;
    const turnDeadlineMs =
      table.actingSeatIndex !== null &&
      actionTimeSeconds !== null &&
      actionTimeSeconds > 0 &&
      room.turnStartedAtMs !== null
        ? room.turnStartedAtMs + actionTimeSeconds * 1000
        : null;

    return {
      roomId: room.roomId,
      isLocked: room.isLocked,
      hostPlayerId: room.hostPlayerId,
      table,
      legalActions: getLegalActions(table),
      leaderboard: getTournamentLeaderboard(table),
      actionLog: [...room.actionLog],
      turnDeadlineMs,
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
