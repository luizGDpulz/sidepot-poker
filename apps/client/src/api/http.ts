import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinLobbyRequest,
  JoinLobbyResponse,
  PlayerId,
  SessionRole,
} from '@sidepot/core';

export interface NetworkInfoResponse {
  readonly lanAddresses: readonly string[];
}

export interface RoomAccessProbeResponse {
  readonly accessType: 'SESSION' | 'INVITE';
  readonly role: SessionRole | null;
  readonly playerId: PlayerId | null;
  readonly requestId: string | null;
  readonly tableName: string;
  readonly isLocked: boolean;
}

export class ApiHttpError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new ApiHttpError(
      res.status,
      payload.error ?? 'HTTP_ERROR',
      payload.message ?? `HTTP ${String(res.status)}`,
    );
  }
  return payload as T;
}

export async function fetchNetworkInfo(): Promise<NetworkInfoResponse> {
  const res = await fetch('/api/network-info');
  return parseJsonOrThrow<NetworkInfoResponse>(res);
}

export async function apiCreateRoom(
  body: CreateRoomRequest,
): Promise<CreateRoomResponse> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<CreateRoomResponse>(res);
}

export async function apiProbeRoomAccess(
  roomId: string,
  token: string,
): Promise<RoomAccessProbeResponse> {
  const query = new URLSearchParams({ token });
  const res = await fetch(
    `/api/rooms/${encodeURIComponent(roomId)}/access?${query.toString()}`,
  );
  return parseJsonOrThrow<RoomAccessProbeResponse>(res);
}

export async function apiJoinRoomLobby(
  roomId: string,
  body: JoinLobbyRequest,
): Promise<JoinLobbyResponse> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow<JoinLobbyResponse>(res);
}

export function buildWsUrl(
  roomId: string,
  token: string,
  locationLike: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const wsProto = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ roomId, token });
  return `${wsProto}//${locationLike.host}/ws?${params.toString()}`;
}
