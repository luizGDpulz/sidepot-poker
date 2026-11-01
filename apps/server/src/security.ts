import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { PlayerId, SessionRole } from '@sidepot/core';

export interface RoomSecurityStore {
  readonly adminToken: string;
  readonly inviteToken: string;
  readonly displayToken: string;
  /** playerSessionToken -> playerId */
  readonly playerTokens: Map<string, PlayerId>;
  /** applicantToken -> requestId */
  readonly applicantTokens: Map<string, string>;
}

export interface AuthenticatedPrincipal {
  readonly role: SessionRole;
  readonly playerId: PlayerId | null;
  readonly requestId: string | null;
}

export function generateRoomId(): string {
  return `rm_${randomBytes(6).toString('base64url')}`;
}

export function generateOpaqueToken(prefix: string, byteLength = 24): string {
  return `${prefix}_${randomBytes(byteLength).toString('base64url')}`;
}

export function createRoomSecurityStore(): RoomSecurityStore {
  return {
    adminToken: generateOpaqueToken('adm', 24),
    inviteToken: generateOpaqueToken('inv', 18),
    displayToken: generateOpaqueToken('tv', 18),
    playerTokens: new Map<string, PlayerId>(),
    applicantTokens: new Map<string, string>(),
  };
}

export function safeCompareTokens(candidate: string, expected: string): boolean {
  const bufA = Buffer.from(candidate, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function issuePlayerSessionToken(
  store: RoomSecurityStore,
  playerId: PlayerId,
): string {
  const token = generateOpaqueToken('ply', 24);
  store.playerTokens.set(token, playerId);
  return token;
}

export function revokePlayerSessionTokens(
  store: RoomSecurityStore,
  playerId: PlayerId,
): void {
  for (const [token, mappedId] of store.playerTokens.entries()) {
    if (mappedId === playerId) {
      store.playerTokens.delete(token);
    }
  }
}

export function issueApplicantToken(
  store: RoomSecurityStore,
  requestId: string,
): string {
  const token = generateOpaqueToken('app', 18);
  store.applicantTokens.set(token, requestId);
  return token;
}

export function revokeApplicantTokenByRequestId(
  store: RoomSecurityStore,
  requestId: string,
): void {
  for (const [token, mappedReq] of store.applicantTokens.entries()) {
    if (mappedReq === requestId) {
      store.applicantTokens.delete(token);
    }
  }
}

/**
 * Resolves a bearer/query token against a room's ephemeral credentials.
 * Returns null immediately on invalid or unknown tokens.
 */
export function authenticateRoomToken(
  store: RoomSecurityStore,
  token: string | undefined | null,
): AuthenticatedPrincipal | null {
  if (!token || token.length < 8 || token.length > 128) {
    return null;
  }

  if (safeCompareTokens(token, store.adminToken)) {
    return { role: 'HOST', playerId: null, requestId: null };
  }

  if (safeCompareTokens(token, store.displayToken)) {
    return { role: 'DISPLAY', playerId: null, requestId: null };
  }

  const matchedPlayerId = store.playerTokens.get(token);
  if (matchedPlayerId !== undefined) {
    return { role: 'PLAYER', playerId: matchedPlayerId, requestId: null };
  }

  const matchedRequestId = store.applicantTokens.get(token);
  if (matchedRequestId !== undefined) {
    return { role: 'APPLICANT', playerId: null, requestId: matchedRequestId };
  }

  return null;
}

export function validateInviteToken(
  store: RoomSecurityStore,
  inviteToken: string | undefined | null,
): boolean {
  if (!inviteToken || inviteToken.length < 8 || inviteToken.length > 128) {
    return false;
  }
  return safeCompareTokens(inviteToken, store.inviteToken);
}
