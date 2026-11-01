import type {
  BettingActionType,
  Chips,
  ClientWsMessage,
  HostAdminOverlay,
  Player,
  PlayerId,
  PublicRoomSnapshot,
  SeatIndex,
  ServerWsMessage,
  SessionRole,
} from '@sidepot/core';
import { computed, ref } from 'vue';
import { buildWsUrl } from '../api/http.js';
import {
  playBlindLevelUpChime,
  triggerTapHaptic,
  triggerTurnHaptic,
} from '../utils/feedback.js';
import {
  loadRoomCredentials,
  saveRoomCredentials,
} from './credentials.js';

export type WsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type BouncerClientStatus = 'idle' | 'waiting' | 'approved' | 'rejected';

export function createRoomSession() {
  const activeRoomId = ref<string | null>(null);
  const activeToken = ref<string | null>(null);
  const connectionStatus = ref<WsConnectionStatus>('disconnected');
  const role = ref<SessionRole | null>(null);
  const playerId = ref<PlayerId | null>(null);
  const snapshot = ref<PublicRoomSnapshot | null>(null);
  const adminOverlay = ref<HostAdminOverlay | null>(null);
  const bouncerStatus = ref<BouncerClientStatus>('idle');
  const lastError = ref<{ readonly code: string; readonly message: string } | null>(
    null,
  );
  const localClockNowMs = ref<number>(Date.now());

  let socket: WebSocket | null = null;
  let intentionalClose = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let clockInterval: ReturnType<typeof setInterval> | null = null;
  let lastNotifiedTurnKey: string | null = null;

  const myPlayer = computed<Player | null>(() => {
    const snap = snapshot.value;
    const pid = playerId.value;
    if (!snap || !pid) {
      return null;
    }
    for (const seat of snap.table.seats) {
      if (seat && seat.id === pid) {
        return seat;
      }
    }
    return null;
  });

  const isMyTurn = computed<boolean>(() => {
    const snap = snapshot.value;
    const me = myPlayer.value;
    if (!snap || !me) {
      return false;
    }
    return (
      snap.table.actingSeatIndex !== null &&
      snap.table.actingSeatIndex === me.seatIndex
    );
  });

  const displayRemainingSeconds = computed<number>(() => {
    const clock = snapshot.value?.blindClock;
    if (!clock) {
      return 0;
    }
    if (!clock.isRunning) {
      return clock.remainingSeconds;
    }
    const elapsedSec = Math.max(
      0,
      Math.floor((localClockNowMs.value - clock.updatedAtMs) / 1000),
    );
    return Math.max(0, clock.remainingSeconds - elapsedSec);
  });

  const turnRemainingSeconds = computed<number | null>(() => {
    const deadline = snapshot.value?.turnDeadlineMs ?? null;
    if (deadline === null) {
      return null;
    }
    const diffSec = Math.ceil((deadline - localClockNowMs.value) / 1000);
    return Math.max(0, diffSec);
  });

  const clearTimers = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const ensureClockInterval = (): void => {
    if (clockInterval === null && typeof window !== 'undefined') {
      clockInterval = setInterval(() => {
        localClockNowMs.value = Date.now();
      }, 1000);
    }
  };

  const stopClockInterval = (): void => {
    if (clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };

  const sendRaw = (msg: ClientWsMessage): boolean => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(msg));
    return true;
  };

  const scheduleReconnect = (): void => {
    if (intentionalClose || !activeRoomId.value || !activeToken.value) {
      return;
    }
    clearTimers();
    connectionStatus.value = 'reconnecting';
    const delayMs = Math.min(8000, 500 * Math.pow(2, reconnectAttempts));
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      if (!intentionalClose && activeRoomId.value && activeToken.value) {
        openSocket(activeRoomId.value, activeToken.value, true);
      }
    }, delayMs);
  };

  const handleServerMessage = (msg: ServerWsMessage): void => {
    switch (msg.type) {
      case 'auth:welcome': {
        role.value = msg.role;
        playerId.value = msg.playerId;
        if (msg.role === 'APPLICANT') {
          bouncerStatus.value = 'waiting';
        } else if (msg.role === 'PLAYER' || msg.role === 'HOST') {
          bouncerStatus.value = 'approved';
        }
        if (activeRoomId.value && activeToken.value) {
          const existing = loadRoomCredentials(activeRoomId.value);
          saveRoomCredentials({
            roomId: activeRoomId.value,
            token: activeToken.value,
            role: msg.role,
            playerId: msg.playerId,
            requestId: existing?.requestId ?? null,
            inviteToken: existing?.inviteToken ?? null,
            displayToken: existing?.displayToken ?? null,
            updatedAtMs: Date.now(),
          });
        }
        break;
      }

      case 'table:state_sync': {
        snapshot.value = msg.snapshot;
        localClockNowMs.value = Date.now();
        if (role.value === 'HOST' && msg.snapshot.hostPlayerId) {
          playerId.value = msg.snapshot.hostPlayerId;
        }
        // Trigger haptic alert once when action newly lands on this player's seat
        const me = myPlayer.value;
        if (
          me &&
          msg.snapshot.table.actingSeatIndex === me.seatIndex &&
          msg.snapshot.legalActions?.playerId === me.id
        ) {
          const turnKey = `${String(msg.snapshot.table.handNumber)}:${msg.snapshot.table.street}:${String(msg.snapshot.table.betting.fullRaiseCount)}:${me.id}`;
          if (lastNotifiedTurnKey !== turnKey) {
            lastNotifiedTurnKey = turnKey;
            triggerTurnHaptic();
          }
        }
        break;
      }

      case 'host:admin_sync': {
        adminOverlay.value = msg.admin;
        if (activeRoomId.value && activeToken.value) {
          saveRoomCredentials({
            roomId: activeRoomId.value,
            token: activeToken.value,
            role: 'HOST',
            playerId: playerId.value,
            inviteToken: msg.admin.inviteToken,
            displayToken: msg.admin.displayToken,
            updatedAtMs: Date.now(),
          });
        }
        break;
      }

      case 'bouncer:approved': {
        if (!activeRoomId.value) {
          break;
        }
        bouncerStatus.value = 'approved';
        activeToken.value = msg.sessionToken;
        role.value = 'PLAYER';
        playerId.value = msg.playerId;
        saveRoomCredentials({
          roomId: activeRoomId.value,
          token: msg.sessionToken,
          role: 'PLAYER',
          playerId: msg.playerId,
          requestId: msg.requestId,
          updatedAtMs: Date.now(),
        });
        triggerTurnHaptic();
        // Reconnect immediately using the newly issued anti-impersonation player sessionToken
        const roomIdToUpgrade = activeRoomId.value;
        openSocket(roomIdToUpgrade, msg.sessionToken, false);
        break;
      }

      case 'bouncer:rejected': {
        bouncerStatus.value = 'rejected';
        intentionalClose = true;
        clearTimers();
        if (socket) {
          socket.close();
          socket = null;
        }
        connectionStatus.value = 'disconnected';
        break;
      }

      case 'clock:level_up': {
        playBlindLevelUpChime();
        break;
      }

      case 'error': {
        lastError.value = { code: msg.code, message: msg.message };
        break;
      }

      case 'pong':
        break;
    }
  };

  const openSocket = (
    roomId: string,
    token: string,
    isReconnect: boolean,
  ): void => {
    clearTimers();
    if (socket) {
      const prev = socket;
      socket = null;
      prev.onclose = null;
      prev.onerror = null;
      prev.onmessage = null;
      prev.close();
    }

    activeRoomId.value = roomId;
    activeToken.value = token;
    intentionalClose = false;
    connectionStatus.value = isReconnect ? 'reconnecting' : 'connecting';
    ensureClockInterval();

    const ws = new WebSocket(buildWsUrl(roomId, token));
    socket = ws;

    ws.onopen = () => {
      if (socket !== ws) {
        return;
      }
      reconnectAttempts = 0;
      connectionStatus.value = 'connected';
      lastError.value = null;
      if (isReconnect) {
        sendRaw({ type: 'state:request_sync' });
      }
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (socket !== ws) {
        return;
      }
      try {
        const parsed = JSON.parse(event.data) as ServerWsMessage;
        handleServerMessage(parsed);
      } catch (_err) {
        // Ignore malformed payloads
      }
    };

    ws.onclose = () => {
      if (socket !== ws) {
        return;
      }
      socket = null;
      if (!intentionalClose) {
        scheduleReconnect();
      } else {
        connectionStatus.value = 'disconnected';
      }
    };

    ws.onerror = () => {
      // Browser immediately follows onerror with onclose where backoff runs
    };
  };

  const handleVisibilityChange = (): void => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }
    if (!activeRoomId.value || !activeToken.value || intentionalClose) {
      return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendRaw({ type: 'state:request_sync' });
    } else if (!socket || socket.readyState === WebSocket.CLOSED) {
      reconnectAttempts = 0;
      openSocket(activeRoomId.value, activeToken.value, true);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  const connect = (roomId: string, token: string): void => {
    lastError.value = null;
    bouncerStatus.value = 'idle';
    openSocket(roomId, token, false);
  };

  const disconnect = (): void => {
    intentionalClose = true;
    clearTimers();
    stopClockInterval();
    if (socket) {
      const prev = socket;
      socket = null;
      prev.onclose = null;
      prev.close();
    }
    connectionStatus.value = 'disconnected';
  };

  const clearError = (): void => {
    lastError.value = null;
  };

  // Player & Host ergonomics
  const sendGameAction = (action: BettingActionType, amount?: Chips): void => {
    triggerTapHaptic();
    if (amount !== undefined) {
      sendRaw({ type: 'game:action', action, amount });
    } else {
      sendRaw({ type: 'game:action', action });
    }
  };

  const approveJoin = (requestId: string, seatIndex?: SeatIndex): void => {
    triggerTapHaptic();
    if (seatIndex !== undefined) {
      sendRaw({ type: 'host:approve_join', requestId, seatIndex });
    } else {
      sendRaw({ type: 'host:approve_join', requestId });
    }
  };

  const rejectJoin = (requestId: string): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:reject_join', requestId });
  };

  const seatSelf = (name: string): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:seat_self', name });
  };

  const setRoomLocked = (isLocked: boolean): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:set_locked', isLocked });
  };

  const startNextHand = (): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:start_hand' });
  };

  const resolveShowdown = (
    winnersByPotId: Readonly<Record<string, readonly PlayerId[]>>,
  ): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:resolve_showdown', winnersByPotId });
  };

  const undoLastAction = (): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:undo' });
  };

  const adjustPlayerStack = (targetPlayerId: PlayerId, newStack: Chips): void => {
    triggerTapHaptic();
    sendRaw({
      type: 'host:adjust_stack',
      playerId: targetPlayerId,
      newStack,
    });
  };

  const rebuyPlayer = (targetPlayerId: PlayerId): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:rebuy', playerId: targetPlayerId });
  };

  const addonPlayer = (targetPlayerId: PlayerId): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:addon', playerId: targetPlayerId });
  };

  const kickPlayer = (targetPlayerId: PlayerId): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:kick_player', playerId: targetPlayerId });
  };

  const toggleClock = (running: boolean): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:toggle_clock', running });
  };

  const advanceBlindLevel = (): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:advance_blind_level' });
  };

  const forceSkipTurn = (): void => {
    triggerTapHaptic();
    sendRaw({ type: 'host:force_skip_turn' });
  };

  const setSittingOut = (targetPlayerId: PlayerId, sittingOut: boolean): void => {
    triggerTapHaptic();
    sendRaw({
      type: 'host:set_sitting_out',
      playerId: targetPlayerId,
      sittingOut,
    });
  };

  const setActionTimer = (actionTimeSeconds: number | null): void => {
    triggerTapHaptic();
    sendRaw({
      type: 'host:set_action_timer',
      actionTimeSeconds,
    });
  };

  return {
    activeRoomId,
    activeToken,
    connectionStatus,
    role,
    playerId,
    snapshot,
    adminOverlay,
    bouncerStatus,
    lastError,
    myPlayer,
    isMyTurn,
    displayRemainingSeconds,
    turnRemainingSeconds,
    connect,
    disconnect,
    clearError,
    sendGameAction,
    approveJoin,
    rejectJoin,
    seatSelf,
    setRoomLocked,
    startNextHand,
    resolveShowdown,
    undoLastAction,
    adjustPlayerStack,
    rebuyPlayer,
    addonPlayer,
    kickPlayer,
    toggleClock,
    advanceBlindLevel,
    forceSkipTurn,
    setSittingOut,
    setActionTimer,
  };
}

let singletonSession: ReturnType<typeof createRoomSession> | null = null;

export function useRoomSession() {
  if (!singletonSession) {
    singletonSession = createRoomSession();
  }
  return singletonSession;
}
