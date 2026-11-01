import { describe, expect, it } from 'vitest';
import { RoomManager, ServerHttpError } from '../src/room-manager.js';
import { authenticateRoomToken } from '../src/security.js';

describe('Lobby Bouncer (Host Approval Queue) & Lock Room Defense', () => {
  it('holds QR visitors in pending Bouncer queue until Host explicitly accepts or rejects', () => {
    const manager = new RoomManager();
    const created = manager.createRoom({
      tableName: 'Barbecue Holdem',
      hostPlayerName: 'Luiz (Host)',
    });

    const room = manager.requireRoom(created.roomId);
    expect(created.hostPlayerId).toBeTruthy();
    expect(room.history.present.seats[0]?.name).toBe('Luiz (Host)');

    // Stranger without inviteToken gets immediate 401
    expect(() =>
      manager.requestJoinLobby(created.roomId, {
        inviteToken: 'inv_forged_bad',
        name: 'Intruder',
      }),
    ).toThrow(ServerHttpError);

    // Friend 1 and Friend 2 enter lobby with genuine QR inviteToken
    const pedroReq = manager.requestJoinLobby(created.roomId, {
      inviteToken: created.inviteToken,
      name: 'Pedro',
    });
    const trollReq = manager.requestJoinLobby(created.roomId, {
      inviteToken: created.inviteToken,
      name: 'Unknown Neighbor',
    });

    // Neither visitor is seated yet! Both are in pendingJoinRequests
    const overlayBefore = manager.buildHostAdminOverlay(room);
    expect(overlayBefore.pendingJoinRequests).toHaveLength(2);
    expect(room.history.present.seats[1]).toBeNull();
    expect(authenticateRoomToken(room.security, pedroReq.applicantToken)?.role).toBe(
      'APPLICANT',
    );

    // Host approves Pedro and rejects Unknown Neighbor
    const approved = manager.approveJoinRequest(created.roomId, pedroReq.requestId);
    manager.rejectJoinRequest(created.roomId, trollReq.requestId);

    // Applicant tokens are revoked; Pedro now holds a unique PLAYER session token
    expect(authenticateRoomToken(room.security, pedroReq.applicantToken)).toBeNull();
    expect(authenticateRoomToken(room.security, trollReq.applicantToken)).toBeNull();
    expect(authenticateRoomToken(room.security, approved.sessionToken)).toEqual({
      role: 'PLAYER',
      playerId: approved.playerId,
      requestId: null,
    });

    expect(room.history.present.seats[1]?.name).toBe('Pedro');
    expect(manager.buildHostAdminOverlay(room).pendingJoinRequests).toHaveLength(0);
  });

  it('blocks new entries even with a valid QR inviteToken when Host activates Lock Room', () => {
    const manager = new RoomManager();
    const created = manager.createRoom({ tableName: 'Locked Tournament' });

    manager.setRoomLocked(created.roomId, true);

    try {
      manager.requestJoinLobby(created.roomId, {
        inviteToken: created.inviteToken,
        name: 'Latecomer',
      });
      expect.unreachable('Expected ServerHttpError 403 ROOM_LOCKED');
    } catch (err) {
      expect(err).toBeInstanceOf(ServerHttpError);
      expect((err as ServerHttpError).statusCode).toBe(403);
      expect((err as ServerHttpError).errorCode).toBe('ROOM_LOCKED');
    }
  });
});
