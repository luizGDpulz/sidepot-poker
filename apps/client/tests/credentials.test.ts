import { describe, expect, it } from 'vitest';
import { buildWsUrl } from '../src/api/http.js';
import {
  clearRoomCredentials,
  loadRoomCredentials,
  saveRoomCredentials,
  type KeyValueStorage,
} from '../src/stores/credentials.js';

function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('@sidepot/client credential storage & WS URL builder', () => {
  it('persists and upgrades room credentials from APPLICANT to PLAYER', () => {
    const storage = createMemoryStorage();
    saveRoomCredentials(
      {
        roomId: 'room-123',
        token: 'app_initial',
        role: 'APPLICANT',
        playerId: null,
        requestId: 'req-1',
        updatedAtMs: 1000,
      },
      storage,
    );

    const loadedApplicant = loadRoomCredentials('room-123', storage);
    expect(loadedApplicant?.role).toBe('APPLICANT');
    expect(loadedApplicant?.token).toBe('app_initial');

    // Simulate Bouncer approval upgrading credentials to anti-impersonation ply_ token
    saveRoomCredentials(
      {
        roomId: 'room-123',
        token: 'ply_secret_session',
        role: 'PLAYER',
        playerId: 'p-1',
        requestId: 'req-1',
        updatedAtMs: 2000,
      },
      storage,
    );

    const upgraded = loadRoomCredentials('room-123', storage);
    expect(upgraded?.role).toBe('PLAYER');
    expect(upgraded?.playerId).toBe('p-1');
    expect(upgraded?.token).toBe('ply_secret_session');

    clearRoomCredentials('room-123', storage);
    expect(loadRoomCredentials('room-123', storage)).toBeNull();
  });

  it('constructs ws:// and wss:// URLs matching the origin protocol', () => {
    expect(
      buildWsUrl('friday-1', 'ply_abc', {
        protocol: 'http:',
        host: '192.168.0.15:3000',
      }),
    ).toBe('ws://192.168.0.15:3000/ws?roomId=friday-1&token=ply_abc');

    expect(
      buildWsUrl('friday-1', 'tv_xyz', {
        protocol: 'https:',
        host: 'poker.falcon.example',
      }),
    ).toBe('wss://poker.falcon.example/ws?roomId=friday-1&token=tv_xyz');
  });
});
