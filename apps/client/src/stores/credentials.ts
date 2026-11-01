import type { PlayerId, SessionRole } from '@sidepot/core';

export interface StoredRoomCredentials {
  readonly roomId: string;
  readonly token: string;
  readonly role: SessionRole;
  readonly playerId: PlayerId | null;
  readonly requestId?: string | null;
  readonly inviteToken?: string | null;
  readonly displayToken?: string | null;
  readonly updatedAtMs: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function credentialKey(roomId: string): string {
  return `sidepot:room-creds:${roomId}`;
}

function getDefaultStorage(): KeyValueStorage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function loadRoomCredentials(
  roomId: string,
  storage: KeyValueStorage | null = getDefaultStorage(),
): StoredRoomCredentials | null {
  if (!storage || !roomId) {
    return null;
  }
  const raw = storage.getItem(credentialKey(roomId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRoomCredentials>;
    if (
      typeof parsed.roomId === 'string' &&
      typeof parsed.token === 'string' &&
      typeof parsed.role === 'string'
    ) {
      return {
        roomId: parsed.roomId,
        token: parsed.token,
        role: parsed.role,
        playerId: typeof parsed.playerId === 'string' ? parsed.playerId : null,
        requestId:
          typeof parsed.requestId === 'string' ? parsed.requestId : null,
        inviteToken:
          typeof parsed.inviteToken === 'string' ? parsed.inviteToken : null,
        displayToken:
          typeof parsed.displayToken === 'string' ? parsed.displayToken : null,
        updatedAtMs:
          typeof parsed.updatedAtMs === 'number'
            ? parsed.updatedAtMs
            : Date.now(),
      };
    }
  } catch (_err) {
    return null;
  }
  return null;
}

export function saveRoomCredentials(
  creds: StoredRoomCredentials,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (!storage) {
    return;
  }
  storage.setItem(credentialKey(creds.roomId), JSON.stringify(creds));
}

export function clearRoomCredentials(
  roomId: string,
  storage: KeyValueStorage | null = getDefaultStorage(),
): void {
  if (!storage) {
    return;
  }
  storage.removeItem(credentialKey(roomId));
}
