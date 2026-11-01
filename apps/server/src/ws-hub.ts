import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  PokerDomainError,
  getCurrentBlindLevel,
  type BettingActionType,
  type ClientWsMessage,
  type PlayerId,
  type ServerWsMessage,
} from '@sidepot/core';
import { WebSocket, WebSocketServer } from 'ws';
import { SlidingWindowRateLimiter } from './rate-limit.js';
import { ServerHttpError, type RoomManager } from './room-manager.js';
import {
  authenticateRoomToken,
  type AuthenticatedPrincipal,
} from './security.js';

interface ClientConnection {
  readonly ws: WebSocket;
  readonly roomId: string;
  readonly principal: AuthenticatedPrincipal;
}

const VALID_BETTING_ACTIONS = new Set<BettingActionType>([
  'FOLD',
  'CHECK',
  'CALL',
  'BET',
  'RAISE',
  'ALL_IN',
]);

function writeHttpRejection(
  socket: Duplex,
  statusCode: number,
  statusText: string,
): void {
  socket.write(
    `HTTP/1.1 ${String(statusCode)} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function extractIpFromUpgrade(req: IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim().length > 0) {
    return cf.trim();
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim().length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.socket.remoteAddress ?? '127.0.0.1';
}

export class RoomWebSocketHub {
  private readonly wss: WebSocketServer;
  private readonly roomManager: RoomManager;
  private readonly upgradeLimiter: SlidingWindowRateLimiter;
  private readonly connectionsByRoom = new Map<string, Set<ClientConnection>>();

  public constructor(
    roomManager: RoomManager,
    upgradeLimiter = new SlidingWindowRateLimiter({
      windowMs: 10_000,
      maxRequests: 40,
    }),
  ) {
    this.roomManager = roomManager;
    this.upgradeLimiter = upgradeLimiter;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 16 * 1024,
    });
  }

  public attachToServer(server: HttpServer): void {
    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });
  }

  public closeAll(): void {
    for (const set of this.connectionsByRoom.values()) {
      for (const conn of set) {
        conn.ws.close(1001, 'Server shutting down');
      }
    }
    this.connectionsByRoom.clear();
    this.wss.close();
  }

  public broadcastRoomState(roomId: string, rehydrated = false): void {
    const room = this.roomManager.getRoom(roomId);
    const conns = this.connectionsByRoom.get(roomId);
    if (!room || !conns || conns.size === 0) {
      return;
    }

    const connectedPlayers = this.getConnectedPlayerIds(roomId);
    const snapshot = this.roomManager.buildPublicSnapshot(room, connectedPlayers);
    const payload: ServerWsMessage = {
      type: 'table:state_sync',
      rehydrated,
      snapshot,
    };

    for (const conn of conns) {
      if (conn.principal.role !== 'APPLICANT') {
        this.sendJson(conn.ws, payload);
      }
    }
  }

  public broadcastHostOverlay(roomId: string): void {
    const room = this.roomManager.getRoom(roomId);
    const conns = this.connectionsByRoom.get(roomId);
    if (!room || !conns || conns.size === 0) {
      return;
    }

    const admin = this.roomManager.buildHostAdminOverlay(room);
    const payload: ServerWsMessage = {
      type: 'host:admin_sync',
      admin,
    };

    for (const conn of conns) {
      if (conn.principal.role === 'HOST') {
        this.sendJson(conn.ws, payload);
      }
    }
  }

  public broadcastLevelUp(roomId: string): void {
    const room = this.roomManager.getRoom(roomId);
    const conns = this.connectionsByRoom.get(roomId);
    if (!room || !conns || conns.size === 0) {
      return;
    }

    const level = getCurrentBlindLevel(room.history.present);
    const payload: ServerWsMessage = {
      type: 'clock:level_up',
      level: level.level,
      smallBlind: level.smallBlind,
      bigBlind: level.bigBlind,
      ante: level.ante,
    };

    for (const conn of conns) {
      if (conn.principal.role !== 'APPLICANT') {
        this.sendJson(conn.ws, payload);
      }
    }
  }

  private getConnectedPlayerIds(roomId: string): PlayerId[] {
    const room = this.roomManager.getRoom(roomId);
    const conns = this.connectionsByRoom.get(roomId);
    if (!room || !conns) {
      return [];
    }
    const ids = new Set<PlayerId>();
    for (const conn of conns) {
      if (conn.ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (conn.principal.role === 'PLAYER' && conn.principal.playerId) {
        ids.add(conn.principal.playerId);
      } else if (conn.principal.role === 'HOST' && room.hostPlayerId) {
        ids.add(room.hostPlayerId);
      }
    }
    return [...ids];
  }

  private handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void {
    const ip = extractIpFromUpgrade(req);
    const rate = this.upgradeLimiter.consume(ip);
    if (!rate.allowed) {
      writeHttpRejection(socket, 429, 'Too Many Requests');
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
    if (parsedUrl.pathname !== '/ws') {
      writeHttpRejection(socket, 404, 'Not Found');
      return;
    }

    const roomId = parsedUrl.searchParams.get('roomId');
    const token = parsedUrl.searchParams.get('token');
    if (!roomId || !token) {
      writeHttpRejection(socket, 401, 'Unauthorized');
      return;
    }

    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      writeHttpRejection(socket, 404, 'Not Found');
      return;
    }

    const principal = authenticateRoomToken(room.security, token);
    if (!principal) {
      writeHttpRejection(socket, 401, 'Unauthorized');
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.registerConnection(ws, roomId, principal);
    });
  }

  private registerConnection(
    ws: WebSocket,
    roomId: string,
    principal: AuthenticatedPrincipal,
  ): void {
    const conn: ClientConnection = { ws, roomId, principal };
    let roomSet = this.connectionsByRoom.get(roomId);
    if (!roomSet) {
      roomSet = new Set<ClientConnection>();
      this.connectionsByRoom.set(roomId, roomSet);
    }
    roomSet.add(conn);

    const room = this.roomManager.getRoom(roomId);
    const effectivePlayerId =
      principal.role === 'HOST'
        ? (room?.hostPlayerId ?? null)
        : principal.playerId;

    this.sendJson(ws, {
      type: 'auth:welcome',
      role: principal.role,
      playerId: effectivePlayerId,
    });

    if (room && principal.role !== 'APPLICANT') {
      this.sendDirectSync(conn, true);
      if (principal.role === 'PLAYER' || principal.role === 'HOST') {
        this.broadcastRoomState(roomId, false);
      }
    }

    ws.on('message', (raw) => {
      this.handleMessage(conn, raw.toString('utf8'));
    });

    ws.on('close', () => {
      const currentSet = this.connectionsByRoom.get(roomId);
      if (currentSet) {
        currentSet.delete(conn);
        if (currentSet.size === 0) {
          this.connectionsByRoom.delete(roomId);
        }
      }
      if (principal.role === 'PLAYER' || principal.role === 'HOST') {
        this.broadcastRoomState(roomId, false);
      }
    });
  }

  protected sendDirectSync(conn: ClientConnection, rehydrated: boolean): void {
    const room = this.roomManager.getRoom(conn.roomId);
    if (!room) {
      return;
    }
    const connectedPlayers = this.getConnectedPlayerIds(conn.roomId);
    const snapshot = this.roomManager.buildPublicSnapshot(room, connectedPlayers);
    this.sendJson(conn.ws, {
      type: 'table:state_sync',
      rehydrated,
      snapshot,
    });
    if (conn.principal.role === 'HOST') {
      this.sendJson(conn.ws, {
        type: 'host:admin_sync',
        admin: this.roomManager.buildHostAdminOverlay(room),
      });
    }
  }

  private handleMessage(conn: ClientConnection, rawText: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (_err) {
      this.sendError(conn.ws, 'INVALID_JSON', 'Malformed JSON WebSocket payload');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      this.sendError(conn.ws, 'INVALID_MESSAGE', 'Missing message type field');
      return;
    }

    const msg = parsed as ClientWsMessage;

    if (msg.type === 'ping') {
      this.sendJson(conn.ws, { type: 'pong', serverTimeMs: Date.now() });
      return;
    }

    if (msg.type === 'state:request_sync') {
      if (conn.principal.role === 'APPLICANT') {
        return;
      }
      this.sendDirectSync(conn, true);
      return;
    }

    // Strict RBAC Read-Only enforcement for TV Display & Pending Applicants (ADR-001)
    if (conn.principal.role === 'DISPLAY') {
      this.sendError(
        conn.ws,
        'FORBIDDEN_READ_ONLY',
        'TV Display connection is strictly read-only',
      );
      return;
    }

    if (conn.principal.role === 'APPLICANT') {
      this.sendError(
        conn.ws,
        'FORBIDDEN_APPLICANT',
        'Awaiting Host approval before performing table actions',
      );
      return;
    }

    try {
      if (msg.type === 'game:action') {
        const room = this.roomManager.requireRoom(conn.roomId);
        const actorId =
          conn.principal.role === 'PLAYER'
            ? conn.principal.playerId
            : room.hostPlayerId;

        if (!actorId) {
          this.sendError(
            conn.ws,
            'HOST_NOT_SEATED',
            'Host must take a seat at the table before making betting actions',
          );
          return;
        }
        if (!VALID_BETTING_ACTIONS.has(msg.action)) {
          this.sendError(conn.ws, 'INVALID_ACTION', 'Unknown betting action');
          return;
        }
        this.roomManager.dispatchPlayerAction(
          conn.roomId,
          actorId,
          msg.action,
          msg.amount,
        );
        this.broadcastRoomState(conn.roomId, false);
        return;
      }

      // All remaining commands require HOST privileges
      if (conn.principal.role !== 'HOST') {
        this.sendError(
          conn.ws,
          'FORBIDDEN_ROLE',
          'Host privileges are required for administrative table commands',
        );
        return;
      }

      this.handleHostCommand(conn, msg);
    } catch (err) {
      if (err instanceof PokerDomainError) {
        this.sendError(conn.ws, err.code, err.message);
      } else if (err instanceof ServerHttpError) {
        this.sendError(conn.ws, err.errorCode, err.message);
      } else {
        this.sendError(conn.ws, 'INTERNAL_ERROR', 'Unexpected command error');
      }
    }
  }

  private handleHostCommand(conn: ClientConnection, msg: ClientWsMessage): void {
    const { roomId } = conn;

    switch (msg.type) {
      case 'host:approve_join': {
        const { playerId, sessionToken } = this.roomManager.approveJoinRequest(
          roomId,
          msg.requestId,
          msg.seatIndex,
        );
        this.notifyAndCloseApplicant(roomId, msg.requestId, {
          type: 'bouncer:approved',
          requestId: msg.requestId,
          playerId,
          sessionToken,
        });
        this.broadcastRoomState(roomId, false);
        this.broadcastHostOverlay(roomId);
        break;
      }

      case 'host:reject_join': {
        this.roomManager.rejectJoinRequest(roomId, msg.requestId);
        this.notifyAndCloseApplicant(roomId, msg.requestId, {
          type: 'bouncer:rejected',
          requestId: msg.requestId,
        });
        this.broadcastHostOverlay(roomId);
        break;
      }

      case 'host:seat_self': {
        const playerId = this.roomManager.seatHostSelf(
          roomId,
          msg.name,
          msg.avatar,
        );
        this.sendJson(conn.ws, {
          type: 'auth:welcome',
          role: 'HOST',
          playerId,
        });
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:set_locked': {
        this.roomManager.setRoomLocked(roomId, msg.isLocked);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:start_hand': {
        this.roomManager.startHand(roomId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:resolve_showdown': {
        this.roomManager.resolveShowdown(roomId, msg.winnersByPotId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:undo': {
        this.roomManager.undo(roomId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:adjust_stack': {
        this.roomManager.adjustStack(roomId, msg.playerId, msg.newStack);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:rebuy': {
        this.roomManager.rebuy(roomId, msg.playerId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:addon': {
        this.roomManager.addOn(roomId, msg.playerId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:kick_player': {
        this.roomManager.kickPlayer(roomId, msg.playerId);
        this.disconnectPlayerSockets(roomId, msg.playerId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:toggle_clock': {
        this.roomManager.toggleBlindClock(roomId, msg.running);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:advance_blind_level': {
        const leveledUp = this.roomManager.forceAdvanceBlindLevel(roomId);
        if (leveledUp) {
          this.broadcastLevelUp(roomId);
        }
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:force_skip_turn': {
        this.roomManager.forceSkipTurn(roomId);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:set_sitting_out': {
        this.roomManager.setSittingOut(roomId, msg.playerId, msg.sittingOut);
        this.broadcastRoomState(roomId, false);
        break;
      }

      case 'host:set_action_timer': {
        this.roomManager.setActionTimer(roomId, msg.actionTimeSeconds);
        this.broadcastRoomState(roomId, false);
        break;
      }

      default:
        this.sendError(conn.ws, 'UNKNOWN_COMMAND', 'Unrecognized command');
    }
  }

  private notifyAndCloseApplicant(
    roomId: string,
    requestId: string,
    payload: ServerWsMessage,
  ): void {
    const conns = this.connectionsByRoom.get(roomId);
    if (!conns) {
      return;
    }
    for (const conn of [...conns]) {
      if (
        conn.principal.role === 'APPLICANT' &&
        conn.principal.requestId === requestId
      ) {
        this.sendJson(conn.ws, payload);
        conn.ws.close(1000, 'Bouncer decision delivered');
        conns.delete(conn);
      }
    }
  }

  private disconnectPlayerSockets(roomId: string, playerId: PlayerId): void {
    const conns = this.connectionsByRoom.get(roomId);
    if (!conns) {
      return;
    }
    for (const conn of [...conns]) {
      if (
        conn.principal.role === 'PLAYER' &&
        conn.principal.playerId === playerId
      ) {
        conn.ws.close(4003, 'Removed from table by Host');
        conns.delete(conn);
      }
    }
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    this.sendJson(ws, { type: 'error', code, message });
  }

  private sendJson(ws: WebSocket, message: ServerWsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}
