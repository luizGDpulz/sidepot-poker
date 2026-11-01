import { ref } from 'vue';

export function triggerTurnHaptic(): void {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate([80, 45, 110]);
    }
  } catch (_err) {
    // Ignore unsupported environments
  }
}

export function triggerTapHaptic(): void {
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(20);
    }
  } catch (_err) {
    // Ignore unsupported environments
  }
}

let sharedAudioCtx: AudioContext | null = null;

export function playBlindLevelUpChime(): void {
  try {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return;
    }
    if (!sharedAudioCtx) {
      sharedAudioCtx = new window.AudioContext();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [587.33, 880]; // D5 -> A5

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch (_err) {
    // Audio playback blocked by autoplay policy until first interaction
  }
}

interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface NavigatorWithWakeLock {
  readonly wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

export function useScreenWakeLock() {
  const isActive = ref(false);
  let sentinel: WakeLockSentinelLike | null = null;
  let shouldHold = false;

  const acquire = async (): Promise<void> => {
    shouldHold = true;
    try {
      if (typeof navigator === 'undefined') {
        return;
      }
      const nav = navigator as unknown as NavigatorWithWakeLock;
      if (!nav.wakeLock) {
        return;
      }
      sentinel = await nav.wakeLock.request('screen');
      isActive.value = true;
      sentinel.addEventListener('release', () => {
        isActive.value = false;
      });
    } catch (_err) {
      isActive.value = false;
    }
  };

  const handleVisibilityChange = (): void => {
    if (
      shouldHold &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      (!sentinel || sentinel.released)
    ) {
      void acquire();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  const release = async (): Promise<void> => {
    shouldHold = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch (_err) {
        // Ignore release error
      }
    }
    sentinel = null;
    isActive.value = false;
  };

  return {
    isActive,
    acquire,
    release,
  };
}
