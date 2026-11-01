import { existsSync, readFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import {
  PokerDomainError,
  type CreateRoomRequest,
  type JoinLobbyRequest,
} from '@sidepot/core';
import { Hono } from 'hono';
import {
  SlidingWindowRateLimiter,
  createRateLimitMiddleware,
} from './rate-limit.js';
import { RoomManager, ServerHttpError } from './room-manager.js';
import { authenticateRoomToken, validateInviteToken } from './security.js';
import { RoomWebSocketHub } from './ws-hub.js';

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface CreateServerContextOptions {
  readonly roomManager?: RoomManager;
  readonly wsHub?: RoomWebSocketHub;
  readonly apiRateLimitMax?: number;
  readonly apiRateLimitWindowMs?: number;
  readonly staticRootDir?: string;
}

export interface SidepotServerContext {
  readonly app: Hono;
  readonly roomManager: RoomManager;
  readonly wsHub: RoomWebSocketHub;
  startClockTicker(intervalMs?: number): NodeJS.Timeout;
  stopClockTicker(): void;
}

export function discoverLanIpv4Addresses(): string[] {
  const nets = networkInterfaces();
  const preferred: string[] = [];
  const others: string[] = [];

  for (const [ifName, entries] of Object.entries(nets)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        if (/^(wlan|en|eth|ap)/i.test(ifName)) {
          preferred.push(entry.address);
        } else {
          others.push(entry.address);
        }
      }
    }
  }
  return [...preferred, ...others];
}

export function createSidepotServer(
  options: CreateServerContextOptions = {},
): SidepotServerContext {
  const roomManager = options.roomManager ?? new RoomManager();
  const wsHub = options.wsHub ?? new RoomWebSocketHub(roomManager);

  const apiLimiter = new SlidingWindowRateLimiter({
    windowMs: options.apiRateLimitWindowMs ?? 10_000,
    maxRequests: options.apiRateLimitMax ?? 80,
  });

  const app = new Hono();

  app.get('/healthz', (c) =>
    c.json({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  );

  app.use('/api/*', createRateLimitMiddleware(apiLimiter));

  app.get('/api/network-info', (c) =>
    c.json({
      lanAddresses: discoverLanIpv4Addresses(),
    }),
  );

  app.post('/api/rooms', async (c) => {
    let body: CreateRoomRequest;
    try {
      body = (await c.req.json()) as CreateRoomRequest;
    } catch (_err) {
      return c.json({ error: 'INVALID_JSON', message: 'Invalid JSON body' }, 400);
    }

    if (!body || typeof body.tableName !== 'string') {
      return c.json(
        { error: 'INVALID_REQUEST', message: 'tableName is required' },
        400,
      );
    }

    try {
      const created = roomManager.createRoom(body);
      return c.json(created, 201);
    } catch (err) {
      if (err instanceof PokerDomainError) {
        return c.json({ error: err.code, message: err.message }, 400);
      }
      if (err instanceof ServerHttpError) {
        return c.json({ error: err.errorCode, message: err.message }, err.statusCode);
      }
      return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to create room' }, 500);
    }
  });

  app.get('/api/rooms/:roomId/access', (c) => {
    const roomId = c.req.param('roomId');
    const token =
      c.req.query('token') ??
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '');

    const room = roomManager.getRoom(roomId);
    if (!room) {
      return c.json({ error: 'UNAUTHORIZED', message: 'Unauthorized access' }, 401);
    }

    const sessionPrincipal = authenticateRoomToken(room.security, token);
    if (sessionPrincipal) {
      const effectivePlayerId =
        sessionPrincipal.role === 'HOST'
          ? room.hostPlayerId
          : sessionPrincipal.playerId;

      return c.json({
        accessType: 'SESSION',
        role: sessionPrincipal.role,
        playerId: effectivePlayerId,
        requestId: sessionPrincipal.requestId,
        tableName: room.history.present.name,
        isLocked: room.isLocked,
      });
    }

    if (validateInviteToken(room.security, token)) {
      return c.json({
        accessType: 'INVITE',
        role: null,
        playerId: null,
        requestId: null,
        tableName: room.history.present.name,
        isLocked: room.isLocked,
      });
    }

    return c.json(
      {
        error: 'UNAUTHORIZED',
        message: 'Valid invite or session token is required',
      },
      401,
    );
  });

  app.post('/api/rooms/:roomId/join', async (c) => {
    const roomId = c.req.param('roomId');
    let body: JoinLobbyRequest;
    try {
      body = (await c.req.json()) as JoinLobbyRequest;
    } catch (_err) {
      return c.json({ error: 'INVALID_JSON', message: 'Invalid JSON body' }, 400);
    }

    if (
      !body ||
      typeof body.inviteToken !== 'string' ||
      typeof body.name !== 'string'
    ) {
      return c.json(
        { error: 'INVALID_REQUEST', message: 'inviteToken and name are required' },
        400,
      );
    }

    try {
      const joined = roomManager.requestJoinLobby(roomId, body);
      wsHub.broadcastHostOverlay(roomId);
      return c.json(joined, 201);
    } catch (err) {
      if (err instanceof ServerHttpError) {
        return c.json({ error: err.errorCode, message: err.message }, err.statusCode);
      }
      return c.json({ error: 'INTERNAL_ERROR', message: 'Join request failed' }, 500);
    }
  });

  // Production static bundle & SPA fallback (used in Docker / standalone production mode)
  if (options.staticRootDir && existsSync(options.staticRootDir)) {
    const resolvedRoot = resolve(options.staticRootDir);
    const indexHtmlPath = join(resolvedRoot, 'index.html');

    app.get('*', (c) => {
      const reqPath = c.req.path;
      if (reqPath.startsWith('/api/') || reqPath === '/ws') {
        return c.json({ error: 'NOT_FOUND' }, 404);
      }

      const safeRelPath = normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const candidate = resolve(resolvedRoot, `.${safeRelPath}`);

      if (
        candidate.startsWith(resolvedRoot) &&
        existsSync(candidate) &&
        statSync(candidate).isFile()
      ) {
        const ext = extname(candidate).toLowerCase();
        const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
        const content = readFileSync(candidate);
        return c.body(content, 200, {
          'Content-Type': mime,
          'Cache-Control':
            ext === '.html'
              ? 'no-cache'
              : 'public, max-age=31536000, immutable',
        });
      }

      if (existsSync(indexHtmlPath)) {
        const html = readFileSync(indexHtmlPath);
        return c.body(html, 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }

      return c.text('Not Found', 404);
    });
  }

  let tickerHandle: NodeJS.Timeout | null = null;

  const startClockTicker = (intervalMs = 1000): NodeJS.Timeout => {
    if (tickerHandle) {
      clearInterval(tickerHandle);
    }
    tickerHandle = setInterval(() => {
      const now = Date.now();
      for (const room of roomManager.getAllRooms()) {
        if (!room.clockRunning) {
          continue;
        }
        const leveledUp = roomManager.tickRoomClock(room, now);
        if (leveledUp) {
          wsHub.broadcastLevelUp(room.roomId);
          wsHub.broadcastRoomState(room.roomId, false);
        }
      }
    }, intervalMs);
    tickerHandle.unref();
    return tickerHandle;
  };

  const stopClockTicker = (): void => {
    if (tickerHandle) {
      clearInterval(tickerHandle);
      tickerHandle = null;
    }
  };

  return {
    app,
    roomManager,
    wsHub,
    startClockTicker,
    stopClockTicker,
  };
}
