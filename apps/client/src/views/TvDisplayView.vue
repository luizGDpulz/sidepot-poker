<script setup lang="ts">
import type { BlindLevel, Chips } from '@sidepot/core';
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from '../i18n/index.js';
import { useTvDisplayStream } from '../tv/use-tv-stream.js';
import {
  formatChips,
  formatClock,
  formatStreetBadge,
} from '../utils/format.js';

const props = defineProps<{
  roomId?: string;
}>();

const route = useRoute();
const { locale, t } = useI18n();
const tv = useTvDisplayStream();

const resolvedRoomId = computed<string>(() => {
  if (props.roomId) {
    return props.roomId;
  }
  return typeof route.query['room'] === 'string' ? route.query['room'] : '';
});

const currentBlind = computed<BlindLevel | null>(() => {
  const snap = tv.snapshot.value;
  if (!snap) {
    return null;
  }
  const sched = snap.table.config.blindSchedule;
  const idx = Math.min(sched.length - 1, Math.max(0, snap.table.blindLevelIndex));
  return sched[idx] ?? null;
});

const nextBlind = computed<BlindLevel | null>(() => {
  const snap = tv.snapshot.value;
  if (!snap) {
    return null;
  }
  const sched = snap.table.config.blindSchedule;
  const nextIdx = snap.table.blindLevelIndex + 1;
  return nextIdx < sched.length ? (sched[nextIdx] ?? null) : null;
});

const totalPot = computed<Chips>(() => {
  const snap = tv.snapshot.value;
  if (!snap) {
    return 0;
  }
  return snap.table.pots.reduce((sum, p) => sum + p.amount, 0);
});

const podiumTopThree = computed(() => {
  const snap = tv.snapshot.value;
  if (!snap || !snap.table.championPlayerId) {
    return [];
  }
  return snap.leaderboard.slice(0, 3);
});

function seatPositionStyle(index: number, total: number): Record<string, string> {
  // Distribute seats evenly around an ellipse starting at top-center
  const angle = (index / Math.max(2, total)) * Math.PI * 2 - Math.PI / 2;
  const radiusX = 41;
  const radiusY = 37;
  const left = 50 + radiusX * Math.cos(angle);
  const top = 50 + radiusY * Math.sin(angle);
  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
  };
}

function roleBadges(seatIndex: number): string[] {
  const table = tv.snapshot.value?.table;
  if (!table) {
    return [];
  }
  const list: string[] = [];
  if (table.dealerSeatIndex === seatIndex) {
    list.push('D');
  }
  if (table.smallBlindSeatIndex === seatIndex) {
    list.push('SB');
  }
  if (table.bigBlindSeatIndex === seatIndex) {
    list.push('BB');
  }
  return list;
}

onMounted(() => {
  const token =
    typeof route.query['token'] === 'string' ? route.query['token'] : '';
  tv.start(resolvedRoomId.value, token);
});
</script>

<template>
  <main class="flex min-h-dvh flex-col justify-between overflow-hidden bg-zinc-950 px-6 py-5 text-zinc-100 select-none">
    <!-- Top Smart TV Broadcast Header -->
    <header class="flex items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
      <div class="flex items-center gap-3.5">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-xl font-extrabold text-emerald-400">
          ♠
        </div>
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-zinc-100">
            {{ tv.snapshot.value?.table.name ?? 'Sidepot TV' }}
          </h1>
          <div class="flex items-center gap-2 text-xs text-zinc-400">
            <span class="rounded bg-zinc-900 px-2 py-0.5 font-mono font-bold text-amber-400">
              {{ t('tvReadOnlyBadge') }}
            </span>
            <span v-if="tv.wakeLockActive.value" class="text-emerald-400">
              • {{ t('tvWakeLockActive') }}
            </span>
          </div>
        </div>
      </div>

      <!-- Blind Clock & Structure Centerpiece -->
      <div v-if="currentBlind && tv.snapshot.value" class="flex items-center gap-8 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-6 py-2.5">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-zinc-400">
            {{ t('blindLevelLabel', { level: currentBlind.level }) }}
          </p>
          <p class="tabular-chips text-xl font-extrabold text-emerald-400">
            {{ formatChips(currentBlind.smallBlind, locale) }} / {{ formatChips(currentBlind.bigBlind, locale) }}
            <span v-if="currentBlind.ante > 0" class="ml-1.5 text-sm text-amber-400">
              ({{ t('anteDisplay', { ante: formatChips(currentBlind.ante, locale) }) }})
            </span>
          </p>
        </div>

        <div class="text-center">
          <p
            class="tabular-chips font-mono text-4xl font-black tracking-tight"
            :class="
              tv.remainingSeconds.value <= 60 && tv.snapshot.value.blindClock.isRunning
                ? 'text-amber-400'
                : 'text-zinc-100'
            "
          >
            {{ formatClock(tv.remainingSeconds.value) }}
          </p>
        </div>

        <div v-if="nextBlind" class="border-l border-zinc-800 pl-6 text-right">
          <p class="text-[11px] uppercase tracking-wider text-zinc-500">
            Next • L{{ nextBlind.level }}
          </p>
          <p class="tabular-chips text-sm font-bold text-zinc-300">
            {{ formatChips(nextBlind.smallBlind, locale) }} / {{ formatChips(nextBlind.bigBlind, locale) }}
          </p>
        </div>
      </div>

      <div class="text-right">
        <div class="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-semibold">
          <span
            class="h-2.5 w-2.5 rounded-full"
            :class="
              tv.status.value === 'connected'
                ? 'bg-emerald-400'
                : tv.status.value === 'error'
                  ? 'bg-rose-500'
                  : 'bg-amber-400 animate-pulse'
            "
          />
          <span>
            {{
              tv.status.value === 'connected'
                ? t('statusConnected')
                : tv.status.value === 'error'
                  ? t('statusOffline')
                  : t('statusReconnecting')
            }}
          </span>
        </div>
        <p v-if="tv.snapshot.value" class="mt-1 font-mono text-xs text-zinc-400">
          {{ t('handNumberLabel', { num: tv.snapshot.value.table.handNumber }) }} •
          <span class="font-bold text-emerald-400">
            {{ formatStreetBadge(tv.snapshot.value.table.street, locale) }}
          </span>
        </p>
      </div>
    </header>

    <!-- Error / Waiting Screen -->
    <section
      v-if="tv.errorMessage.value && !tv.snapshot.value"
      class="m-auto max-w-md rounded-2xl border border-rose-500/40 bg-zinc-900 p-6 text-center"
    >
      <p class="text-base font-bold text-rose-300">{{ tv.errorMessage.value }}</p>
    </section>

    <!-- Champion Podium Overlay -->
    <section
      v-else-if="podiumTopThree.length > 0"
      class="mx-auto my-auto w-full max-w-3xl space-y-6 rounded-3xl border border-amber-500/50 bg-zinc-900/95 p-10 text-center shadow-2xl"
    >
      <p class="text-sm font-black uppercase tracking-[0.25em] text-amber-400">
        ★ {{ t('championBannerTitle') }} ★
      </p>
      <h2 class="text-5xl font-black text-zinc-100">
        {{ podiumTopThree[0]?.playerName }}
      </h2>
      <p class="tabular-chips text-2xl font-extrabold text-emerald-400">
        {{ formatChips(podiumTopThree[0]?.chips ?? 0, locale) }}
      </p>

      <div class="grid grid-cols-3 gap-4 pt-4">
        <div
          v-for="entry in podiumTopThree"
          :key="entry.playerId"
          class="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
        >
          <p class="text-xs font-bold text-amber-400">#{{ entry.rank }}</p>
          <p class="mt-1 truncate text-lg font-bold text-zinc-100">
            {{ entry.playerName }}
          </p>
        </div>
      </div>
    </section>

    <!-- 16:9 Oval Poker Table Arena -->
    <section
      v-else-if="tv.snapshot.value"
      class="relative mx-auto my-4 w-full max-w-6xl flex-1 min-h-[28rem]"
    >
      <!-- Felt Oval -->
      <div class="absolute inset-x-[13%] inset-y-[14%] flex flex-col items-center justify-center rounded-[999px] border-[10px] border-zinc-800 bg-radial from-emerald-950/60 via-zinc-900 to-zinc-950 shadow-2xl">
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
          {{ t('totalPotLabel') }}
        </p>
        <p class="tabular-chips mt-1 text-5xl font-black text-emerald-400">
          {{ formatChips(totalPot, locale) }}
        </p>

        <div
          v-if="tv.snapshot.value.table.pots.length > 0"
          class="mt-4 flex flex-wrap justify-center gap-2.5 px-6"
        >
          <div
            v-for="pot in tv.snapshot.value.table.pots"
            :key="pot.id"
            class="rounded-xl border border-zinc-700/80 bg-zinc-950/90 px-3.5 py-1.5 text-sm"
          >
            <span class="text-zinc-400">{{ pot.label }}: </span>
            <span class="tabular-chips font-extrabold text-zinc-100">
              {{ formatChips(pot.amount, locale) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Seats Ring -->
      <div
        v-for="(rawSeat, idx) in tv.snapshot.value.table.seats"
        :key="idx"
        :style="seatPositionStyle(idx, tv.snapshot.value.table.config.maxSeats)"
        class="absolute -translate-x-1/2 -translate-y-1/2 w-48"
      >
        <div
          v-if="rawSeat !== null"
          class="rounded-2xl border px-4 py-3 shadow-xl transition"
          :class="[
            tv.snapshot.value.table.actingSeatIndex === idx
              ? 'border-emerald-400 bg-zinc-900 ring-4 ring-emerald-500/25 scale-105'
              : 'border-zinc-800 bg-zinc-900/95',
            rawSeat.status === 'FOLDED' || rawSeat.status === 'ELIMINATED'
              ? 'opacity-40'
              : '',
          ]"
        >
          <div class="flex items-center justify-between gap-1.5">
            <span class="truncate text-base font-bold text-zinc-100">
              {{ rawSeat.name }}
            </span>
            <div class="flex items-center gap-1 shrink-0">
              <span
                v-for="badge in roleBadges(idx)"
                :key="badge"
                class="rounded-full px-2 py-0.5 text-[11px] font-black"
                :class="
                  badge === 'D'
                    ? 'bg-zinc-100 text-zinc-950'
                    : badge === 'SB'
                      ? 'bg-sky-500/25 text-sky-300'
                      : 'bg-indigo-500/25 text-indigo-300'
                "
              >
                {{ badge }}
              </span>
            </div>
          </div>

          <div class="mt-1.5 flex items-baseline justify-between">
            <span class="tabular-chips text-xl font-black text-emerald-400">
              {{ formatChips(rawSeat.stack, locale) }}
            </span>
            <span
              v-if="rawSeat.status === 'ALL_IN'"
              class="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-zinc-950"
            >
              {{ t('allInBadge') }}
            </span>
            <span
              v-else-if="rawSeat.streetBet > 0"
              class="tabular-chips text-xs font-bold text-amber-400"
            >
              +{{ formatChips(rawSeat.streetBet, locale) }}
            </span>
          </div>
        </div>

        <div
          v-else
          class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-950/60 px-3 py-2 text-center text-xs text-zinc-600"
        >
          {{ t('emptySeatLabel', { num: idx + 1 }) }}
        </div>
      </div>
    </section>

    <footer class="flex items-center justify-between border-t border-zinc-900 pt-2 text-xs text-zinc-500">
      <span>Sidepot • Open-Source Live Poker Manager</span>
      <span v-if="resolvedRoomId" class="font-mono">#{{ resolvedRoomId }}</span>
    </footer>
  </main>
</template>
