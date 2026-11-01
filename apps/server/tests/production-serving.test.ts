import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CreateRoomResponse, ServerWsMessage } from '@sidepot/core';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  startSidepotHttpServer,
  type RunningSidepotServer,
} from '../src/index.js';

const CLIENT_DIST_DIR = resolve(
  fileURLToPath(new URL('../../client/dist', import.meta.url)),
);

describe('Unified single-port production server (SPA + /tv + REST + WS)', () => {
  let server: RunningSidepotServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('serves /healthz, immutable Vite assets, SPA deep-link fallbacks and live WebSockets on one port', async () => {
    server = await startSidepotHttpServer(0, '127.0.0.1', {
      staticRootDir: CLIENT_DIST_DIR,
    });
    const baseUrl = `http://127.0.0.1:${String(server.port)}`;

    // 1. Healthcheck endpoint for Docker / reverse proxy
    const healthRes = await fetch(`${baseUrl}/healthz`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as { status: string };
    expect(healthJson.status).toBe('ok');

    // 2. Root HTML & SPA fallback for /join and /tv/:roomId
    for (const spaPath of [
      '/',
      '/join?room=test&invite=inv_123',
      '/tv/test-room?token=tv_123',
    ]) {
      const htmlRes = await fetch(`${baseUrl}${spaPath}`);
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers.get('content-type')).toContain('text/html');
      expect(htmlRes.headers.get('cache-control')).toBe('no-cache');
      const body = await htmlRes.text();
      expect(body).toContain('<div id="app"></div>');
      expect(body).toContain('name="color-scheme" content="dark"');
    }

    // 3. Immutable hashed JS asset serving
    const assetFiles = readdirSync(resolve(CLIENT_DIST_DIR, 'assets'));
    const tvAsset = assetFiles.find(
      (f) => f.startsWith('TvDisplayView-') && f.endsWith('.js'),
    );
    expect(tvAsset).toBeDefined();

    const assetRes = await fetch(`${baseUrl}/assets/${tvAsset!}`);
    expect(assetRes.status).toBe(200);
    expect(assetRes.headers.get('content-type')).toContain('text/javascript');
    expect(assetRes.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );

    // 4. Unknown API routes return JSON 404 rather than HTML SPA fallback
    const api404 = await fetch(`${baseUrl}/api/non-existent-route`);
    expect(api404.status).toBe(404);

    // 5. Full REST + Read-Only /tv WebSocket handshake on the same port
    const createRes = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableName: 'Falcon Production Test',
        hostPlayerName: 'Luiz',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as CreateRoomResponse;

    const welcomeMsg = await new Promise<ServerWsMessage>((res, rej) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${String(server!.port)}/ws?roomId=${created.roomId}&token=${created.displayToken}`,
      );
      ws.once('message', (raw) => {
        const parsed = JSON.parse(String(raw)) as ServerWsMessage;
        ws.close();
        res(parsed);
      });
      ws.once('error', rej);
    });

    expect(welcomeMsg).toEqual({
      type: 'auth:welcome',
      role: 'DISPLAY',
      playerId: null,
    });
  });
});
