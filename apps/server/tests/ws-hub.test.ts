import type {
  CreateRoomResponse,
  JoinLobbyResponse,
  ServerWsMessage,
} from '@sidepot/core';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import {
  startSidepotHttpServer,
  type RunningSidepotServer,
} from '../src/index.js';

interface TestWsClient {
  readonly ws: WebSocket;
  readonly messages: ServerWsMessage[];
  waitFor<T extends ServerWsMessage['type']>(
    type: T,
    predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
  ): Promise<Extract<ServerWsMessage, { type: T }>>;
  send(payload: unknown): void;
  close(): void;
}

function connectWsClient(url: string): Promise<TestWsClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: ServerWsMessage[] = [];
    const waiters: Array<() => void> = [];

    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString('utf8')) as ServerWsMessage;
      messages.push(parsed);
      for (const notify of [...waiters]) {
        notify();
      }
    });

    ws.once('open', () => {
      resolve({
        ws,
        messages,
        waitFor<T extends ServerWsMessage['type']>(
          type: T,
          predicate?: (msg: Extract<ServerWsMessage, { type: T }>) => boolean,
        ) {
          const checkExisting = ():
            | Extract<ServerWsMessage, { type: T }>
            | undefined => {
            for (const m of messages) {
              if (m.type === type) {
                const typed = m as Extract<ServerWsMessage, { type: T }>;
                if (!predicate || predicate(typed)) {
                  return typed;
                }
              }
            }
            return undefined;
          };

          const found = checkExisting();
          if (found) {
            return Promise.resolve(found);
          }

          return new Promise<Extract<ServerWsMessage, { type: T }>>(
            (res, rej) => {
            const timer = setTimeout(() => {
              rej(new Error(`Timed out waiting for WS message "${type}"`));
            }, 3000);

            const listener = (): void => {
              const hit = checkExisting();
              if (hit) {
                clearTimeout(timer);
                const idx = waiters.indexOf(listener);
                if (idx >= 0) {
                  waiters.splice(idx, 1);
                }
                res(hit);
              }
            };
            waiters.push(listener);
          });
        },
        send(payload: unknown) {
          ws.send(JSON.stringify(payload));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.once('error', (err) => reject(err));
  });
}

describe('End-to-End Authoritative WebSocket Hub, Bouncer & Read-Only TV', () => {
  let server: RunningSidepotServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('rejects unauthorized HTTP/WS upgrades with 401 and orchestrates full Bouncer + Hand + TV Read-Only + iOS Rehydration', async () => {
    server = await startSidepotHttpServer(0, '127.0.0.1');
    const baseHttp = `http://127.0.0.1:${String(server.port)}`;
    const baseWs = `ws://127.0.0.1:${String(server.port)}/ws`;

    // 1. Healthcheck & 401 guard
    const healthRes = await fetch(`${baseHttp}/healthz`);
    expect(healthRes.status).toBe(200);

    const unauthHttp = await fetch(`${baseHttp}/api/rooms/fake/access?token=bad`);
    expect(unauthHttp.status).toBe(401);

    // 2. Host creates room and sits in Seat 0
    const createRes = await fetch(`${baseHttp}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableName: 'Falcon Live Poker',
        hostPlayerName: 'Alice (Host)',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as CreateRoomResponse;

    // 3. Unauthorized WebSocket upgrade fails before 101 Switching Protocols
    await expect(
      connectWsClient(`${baseWs}?roomId=${created.roomId}&token=inv_bad_token`),
    ).rejects.toThrow();

    // 4. Connect Host WS & Smart TV Read-Only WS
    const hostWs = await connectWsClient(
      `${baseWs}?roomId=${created.roomId}&token=${created.adminToken}`,
    );
    const tvWs = await connectWsClient(
      `${baseWs}?roomId=${created.roomId}&token=${created.displayToken}`,
    );

    const tvWelcome = await tvWs.waitFor('auth:welcome');
    expect(tvWelcome.role).toBe('DISPLAY');

    // TV attempts to start hand -> blocked strictly by ADR-001 Read-Only RBAC!
    tvWs.send({ type: 'host:start_hand' });
    const tvForbidden = await tvWs.waitFor('error');
    expect(tvForbidden.code).toBe('FORBIDDEN_READ_ONLY');

    // 5. Bob scans QR Code and enters Lobby Bouncer queue
    const joinRes = await fetch(`${baseHttp}/api/rooms/${created.roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteToken: created.inviteToken,
        name: 'Bob (iPhone)',
      }),
    });
    expect(joinRes.status).toBe(201);
    const joined = (await joinRes.json()) as JoinLobbyResponse;

    const applicantWs = await connectWsClient(
      `${baseWs}?roomId=${created.roomId}&token=${joined.applicantToken}`,
    );

    // Host sees pending request in real time and approves Bob
    await hostWs.waitFor(
      'host:admin_sync',
      (m) => m.admin.pendingJoinRequests.length === 1,
    );
    hostWs.send({ type: 'host:approve_join', requestId: joined.requestId });

    const approvedMsg = await applicantWs.waitFor('bouncer:approved');
    expect(approvedMsg.playerId).toBeTruthy();

    // Bob connects with his cryptographic PLAYER session token
    const bobWs = await connectWsClient(
      `${baseWs}?roomId=${created.roomId}&token=${approvedMsg.sessionToken}`,
    );
    await bobWs.waitFor('auth:welcome');

    // Bob tries a Host command -> rejected with FORBIDDEN_ROLE
    bobWs.send({ type: 'host:start_hand' });
    const bobForbidden = await bobWs.waitFor('error');
    expect(bobForbidden.code).toBe('FORBIDDEN_ROLE');

    // 6. Host starts Hand #1 -> Alice shoves ALL_IN -> Bob CALLs -> SHOWDOWN -> Alice wins!
    hostWs.send({ type: 'host:start_hand' });
    await bobWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.street === 'PREFLOP',
    );

    hostWs.send({ type: 'game:action', action: 'ALL_IN' });
    await bobWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.legalActions?.playerId === approvedMsg.playerId,
    );

    bobWs.send({ type: 'game:action', action: 'CALL' });
    await tvWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.street === 'SHOWDOWN',
    );

    hostWs.send({
      type: 'host:resolve_showdown',
      winnersByPotId: { main: [created.hostPlayerId!] },
    });

    const finalSync = await tvWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.street === 'COMPLETE',
    );
    expect(finalSync.snapshot.table.championPlayerId).toBe(created.hostPlayerId);

    // 7. iOS Safari Wake State Rehydration & Blind Level Up Alert
    bobWs.messages.length = 0;
    bobWs.send({ type: 'state:request_sync' });
    const rehydrated = await bobWs.waitFor(
      'table:state_sync',
      (m) => m.rehydrated === true,
    );
    expect(rehydrated.snapshot.table.handNumber).toBe(1);

    hostWs.send({ type: 'host:advance_blind_level' });
    const levelUp = await tvWs.waitFor('clock:level_up');
    expect(levelUp.level).toBe(2);

    // 8. Verify live actionLog, Shot Clock timer, Re-buy, Force-Skip Turn & Sit-Out
    expect(finalSync.snapshot.actionLog.length).toBeGreaterThanOrEqual(4);

    hostWs.send({ type: 'host:rebuy', playerId: approvedMsg.playerId });
    await tvWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.championPlayerId === null,
    );

    hostWs.send({ type: 'host:set_action_timer', actionTimeSeconds: 30 });
    await tvWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.config.actionTimeSeconds === 30,
    );

    hostWs.send({ type: 'host:start_hand' });
    const hand2Sync = await tvWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.handNumber === 2 && m.snapshot.table.street === 'PREFLOP',
    );
    expect(hand2Sync.snapshot.turnDeadlineMs).toBeTypeOf('number');

    hostWs.send({ type: 'host:force_skip_turn' });
    const skippedSync = await tvWs.waitFor(
      'table:state_sync',
      (m) => m.snapshot.table.handNumber === 2 && m.snapshot.table.street === 'COMPLETE',
    );
    expect(
      skippedSync.snapshot.actionLog.some((entry) => entry.message.includes('AFK Skip')),
    ).toBe(true);

    hostWs.send({
      type: 'host:set_sitting_out',
      playerId: approvedMsg.playerId,
      sittingOut: true,
    });
    const sitOutSync = await tvWs.waitFor(
      'table:state_sync',
      (m) =>
        m.snapshot.table.seats.some(
          (p) => p?.id === approvedMsg.playerId && p.status === 'SITTING_OUT',
        ),
    );
    expect(sitOutSync.snapshot.table.seats[1]?.status).toBe('SITTING_OUT');

    hostWs.close();
    tvWs.close();
    bobWs.close();
  });
});
