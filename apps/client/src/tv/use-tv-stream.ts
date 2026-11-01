import type { PublicRoomSnapshot, ServerWsMessage } from '@sidepot/core';
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  playBlindLevelUpChime,
  useScreenWakeLock,
} from '../utils/feedback.js';

export type TvConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error';

export function useTvDisplayStream() {
  const snapshot = ref<PublicRoomSnapshot | null>(null);
  const status = ref<TvConnectionState>('connecting');
  const errorMessage = ref<string | null>(null);
  const nowMs = ref<number>(Date.now());
  const wakeLock = useScreenWakeLock();

  let socket: WebSocket | null = null;
  let stopped = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let currentRoomId = '';
  let currentToken = '';

  const remainingSeconds = computed<number>(() => {
    const clock = snapshot.value?.blindClock;
    if (!clock) {
      return 0;
    }
    if (!clock.isRunning) {
      return clock.remainingSeconds;
    }
    const elapsed = Math.max(0, Math.floor((nowMs.value - clock.updatedAtMs) / 1000));
    return Math.max(0, clock.remainingSeconds - elapsed);
  });

  const openReadOnlySocket = (isReconnect: boolean): void => {
    if (stopped || !currentRoomId || !currentToken) {
      return;
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (socket) {
      const old = socket;
      socket = null;
      old.onclose = null;
      old.close();
    }

    status.value = isReconnect ? 'reconnecting' : 'connecting';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
      roomId: currentRoomId,
      token: currentToken,
    });
    const ws = new WebSocket(`${proto}//${window.location.host}/ws?${params.toString()}`);
    socket = ws;

    ws.onopen = () => {
      if (socket !== ws) {
        return;
      }
      attempts = 0;
      status.value = 'connected';
      errorMessage.value = null;
      if (isReconnect) {
        ws.send(JSON.stringify({ type: 'state:request_sync' }));
      }
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      if (socket !== ws) {
        return;
      }
      try {
        const msg = JSON.parse(ev.data) as ServerWsMessage;
        if (msg.type === 'table:state_sync') {
          snapshot.value = msg.snapshot;
          nowMs.value = Date.now();
        } else if (msg.type === 'clock:level_up') {
          playBlindLevelUpChime();
        } else if (msg.type === 'error') {
          errorMessage.value = msg.message;
        }
      } catch (_err) {
        // Ignore malformed frame
      }
    };

    ws.onclose = () => {
      if (socket !== ws || stopped) {
        return;
      }
      socket = null;
      status.value = 'reconnecting';
      const delay = Math.min(8000, 600 * Math.pow(2, attempts));
      attempts += 1;
      retryTimer = setTimeout(() => {
        openReadOnlySocket(true);
      }, delay);
    };
  };

  const onVisibility = (): void => {
    if (stopped || document.visibilityState !== 'visible') {
      return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'state:request_sync' }));
    } else {
      attempts = 0;
      openReadOnlySocket(true);
    }
  };

  const start = (roomId: string, token: string): void => {
    if (!roomId || !token) {
      status.value = 'error';
      errorMessage.value = 'Missing roomId or TV display token';
      return;
    }
    stopped = false;
    currentRoomId = roomId;
    currentToken = token;
    void wakeLock.acquire();
    if (tickTimer === null) {
      tickTimer = setInterval(() => {
        nowMs.value = Date.now();
      }, 1000);
    }
    document.addEventListener('visibilitychange', onVisibility);
    openReadOnlySocket(false);
  };

  const stop = (): void => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (socket) {
      const old = socket;
      socket = null;
      old.onclose = null;
      old.close();
    }
    void wakeLock.release();
  };

  onBeforeUnmount(stop);

  return {
    snapshot,
    status,
    errorMessage,
    remainingSeconds,
    wakeLockActive: wakeLock.isActive,
    start,
    stop,
  };
}
