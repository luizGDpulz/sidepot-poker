import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  SlidingWindowRateLimiter,
  createRateLimitMiddleware,
  extractClientIp,
  isRoleAuthorized,
} from '../src/rate-limit.js';
import {
  authenticateRoomToken,
  createRoomSecurityStore,
  issueApplicantToken,
  issuePlayerSessionToken,
  revokeApplicantTokenByRequestId,
  revokePlayerSessionTokens,
  validateInviteToken,
} from '../src/security.js';

describe('4-Layer Security Primitives: Ephemeral Tokens, RBAC & Rate Limiter', () => {
  it('authenticates HOST, DISPLAY, PLAYER and APPLICANT tokens strictly and rejects unknown tokens', () => {
    const store = createRoomSecurityStore();
    const p1Token = issuePlayerSessionToken(store, 'p1');
    const p2Token = issuePlayerSessionToken(store, 'p2');
    const appToken = issueApplicantToken(store, 'req_1');

    expect(authenticateRoomToken(store, undefined)).toBeNull();
    expect(authenticateRoomToken(store, 'inv_wrongtoken123')).toBeNull();
    // Invite token alone must NEVER authenticate as an active WS session principal!
    expect(authenticateRoomToken(store, store.inviteToken)).toBeNull();
    expect(validateInviteToken(store, store.inviteToken)).toBe(true);
    expect(validateInviteToken(store, 'forged_invite')).toBe(false);

    expect(authenticateRoomToken(store, store.adminToken)).toEqual({
      role: 'HOST',
      playerId: null,
      requestId: null,
    });
    expect(authenticateRoomToken(store, store.displayToken)).toEqual({
      role: 'DISPLAY',
      playerId: null,
      requestId: null,
    });
    expect(authenticateRoomToken(store, p1Token)).toEqual({
      role: 'PLAYER',
      playerId: 'p1',
      requestId: null,
    });
    expect(authenticateRoomToken(store, p2Token)?.playerId).toBe('p2');
    expect(authenticateRoomToken(store, appToken)).toEqual({
      role: 'APPLICANT',
      playerId: null,
      requestId: 'req_1',
    });

    revokePlayerSessionTokens(store, 'p1');
    expect(authenticateRoomToken(store, p1Token)).toBeNull();
    expect(authenticateRoomToken(store, p2Token)?.playerId).toBe('p2');

    revokeApplicantTokenByRequestId(store, 'req_1');
    expect(authenticateRoomToken(store, appToken)).toBeNull();
  });

  it('enforces RBAC role matrix and sliding-window IP rate limiting with Cloudflare headers', async () => {
    expect(isRoleAuthorized('HOST', ['HOST'])).toBe(true);
    expect(isRoleAuthorized('PLAYER', ['HOST'])).toBe(false);
    expect(isRoleAuthorized('DISPLAY', ['HOST', 'PLAYER'])).toBe(false);

    const limiter = new SlidingWindowRateLimiter({
      windowMs: 10_000,
      maxRequests: 2,
    });
    const app = new Hono();
    app.use('*', createRateLimitMiddleware(limiter));
    app.get('/ping', (c) => c.json({ ok: true }));

    const headers = { 'cf-connecting-ip': '203.0.113.42' };
    expect(extractClientIp(new Headers(headers))).toBe('203.0.113.42');

    const r1 = await app.request('/ping', { headers });
    const r2 = await app.request('/ping', { headers });
    const r3 = await app.request('/ping', { headers });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get('Retry-After')).toBeTruthy();
  });
});
