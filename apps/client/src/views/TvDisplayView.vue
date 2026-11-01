<script setup lang="ts">
import type { BlindLevel, Chips } from '@sidepot/core';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppFooterBar from '../components/AppFooterBar.vue';
import CommunityBoardSvg from '../components/CommunityBoardSvg.vue';
import HandRankingsPanel from '../components/HandRankingsPanel.vue';
import HoleCardsSvg from '../components/HoleCardsSvg.vue';
import LanguageFlagPicker from '../components/LanguageFlagPicker.vue';
import { useI18n } from '../i18n/index.js';
import { useTvDisplayStream } from '../tv/use-tv-stream.js';
import {
  formatChips,
  formatClock,
} from '../utils/format.js';

const props = defineProps<{
  roomId?: string;
}>();

const route = useRoute();
const { locale, t } = useI18n();
const tv = useTvDisplayStream();

const showHandRankings = ref(false);
const showLeaderboard = ref(false);

const resolvedRoomId = computed<string>(() => {
  if (props.roomId) {
    return props.roomId;
  }
  return typeof route.query['room'] === 'string' ? route.query['room'] : '';
});

const isCashGame = computed<boolean>(
  () => tv.snapshot.value?.table.config.gameMode === 'CASH',
);

const isTournamentOver = computed<boolean>(
  () =>
    !isCashGame.value &&
    tv.snapshot.value?.table.championPlayerId !== null &&
    tv.snapshot.value?.table.championPlayerId !== undefined,
);

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
  if (!snap || isCashGame.value) {
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
  const fromPots = snap.table.pots.reduce((sum, p) => sum + p.amount, 0);
  if (fromPots > 0) return fromPots;
  return snap.table.seats.reduce((sum, s) => sum + (s ? s.handContribution : 0), 0);
});

const podiumTopThree = computed(() => {
  const snap = tv.snapshot.value;
  if (!snap || !isTournamentOver.value) {
    return [];
  }
  return snap.leaderboard.slice(0, 3);
});

function seatPositionStyle(index: number, total: number): Record<string, string> {
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
  <div class="flex h-dvh flex-col justify-between overflow-hidden bg-zinc-950 text-zinc-100 select-none">
    <!-- Top Smart TV Broadcast Header with Centered Timer -->
    <header class="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-zinc-800/80 px-6 py-3">
      <!-- Left: Table Identity & Live Status -->
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/15 text-lg font-extrabold text-emerald-400">
          ♠
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="truncate text-xl font-extrabold tracking-tight text-zinc-100">
              {{ tv.snapshot.value?.table.name ?? 'Sidepot TV' }}
            </h1>
            <span
              v-if="tv.snapshot.value && tv.snapshot.value.table.handNumber > 0"
              class="rounded bg-zinc-900 px-2 py-0.5 font-mono text-xs font-bold text-zinc-400"
            >
              {{ t('handNumberLabel', { num: tv.snapshot.value.table.handNumber }) }}
            </span>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-zinc-400">
            <span
              class="h-2 w-2 rounded-full"
              :class="
                tv.status.value === 'connected'
                  ? 'bg-emerald-400'
                  : tv.status.value === 'error'
                    ? 'bg-rose-500'
                    : 'bg-amber-400 animate-pulse'
              "
            />
            <span>{{ t('tvReadOnlyBadge') }}</span>
            <span v-if="tv.wakeLockActive.value" class="text-emerald-400">
              • {{ t('tvWakeLockActive') }}
            </span>
          </div>
        </div>
      </div>

      <!-- Center: Tournament Blind Clock OR Fixed Blinds Centerpiece -->
      <div
        v-if="currentBlind && tv.snapshot.value"
        class="flex items-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-6 py-2 shadow-lg"
      >
        <template v-if="!isCashGame">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
              {{ t('blindLevelLabel', { level: currentBlind.level }) }}
            </p>
            <p class="tabular-chips text-lg font-extrabold text-emerald-400">
              {{ formatChips(currentBlind.smallBlind, locale) }} / {{ formatChips(currentBlind.bigBlind, locale) }}
              <span v-if="currentBlind.ante > 0" class="ml-1 text-xs text-amber-400">
                ({{ t('anteDisplay', { ante: formatChips(currentBlind.ante, locale) }) }})
              </span>
            </p>
          </div>

          <div class="text-center">
            <p
              class="tabular-chips font-mono text-3xl sm:text-4xl font-black tracking-tight leading-none"
              :class="
                tv.remainingSeconds.value <= 60 && tv.snapshot.value.blindClock.isRunning
                  ? 'text-amber-400 animate-pulse'
                  : 'text-white'
              "
            >
              {{ formatClock(tv.remainingSeconds.value) }}
            </p>
          </div>

          <div v-if="nextBlind" class="border-l border-zinc-800 pl-5 text-right">
            <p class="text-[10px] uppercase tracking-wider text-zinc-500">
              Next • L{{ nextBlind.level }}
            </p>
            <p class="tabular-chips text-xs font-bold text-zinc-300">
              {{ formatChips(nextBlind.smallBlind, locale) }} / {{ formatChips(nextBlind.bigBlind, locale) }}
            </p>
          </div>
        </template>

        <template v-else>
          <div class="text-center">
            <p class="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
              🪙 {{ t('fixedBlindsBadge') }}
            </p>
            <p class="tabular-chips text-2xl font-black text-white">
              {{ formatChips(currentBlind.smallBlind, locale) }} / {{ formatChips(currentBlind.bigBlind, locale) }}
              <span v-if="currentBlind.ante > 0" class="ml-1.5 text-sm text-amber-400">
                ({{ t('anteDisplay', { ante: formatChips(currentBlind.ante, locale) }) }})
              </span>
            </p>
          </div>
        </template>
      </div>
      <div v-else />

      <!-- Right: Toggleable Hand Rankings, Leaderboard & Flag Picker -->
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          :aria-pressed="showHandRankings"
          class="rounded-xl border px-3 py-1.5 text-xs font-bold transition"
          :class="
            showHandRankings
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
          "
          @click="showHandRankings = !showHandRankings"
        >
          🃏 {{ t('handRankingsBtn') }}
        </button>

        <button
          type="button"
          :aria-pressed="showLeaderboard"
          class="rounded-xl border px-3 py-1.5 text-xs font-bold transition"
          :class="
            showLeaderboard
              ? 'border-amber-500 bg-amber-500/20 text-amber-300'
              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
          "
          @click="showLeaderboard = !showLeaderboard"
        >
          ★ {{ t('leaderboardTitle') }}
        </button>

        <LanguageFlagPicker />
      </div>
    </header>

    <!-- Main TV Broadcast Stage + Optional Side Panels -->
    <div class="relative flex flex-1 min-h-0 overflow-hidden px-6 py-3 gap-4">
      <!-- Left Overlay Drawer: Hand Rankings Cheat-Sheet -->
      <aside
        v-if="showHandRankings"
        class="w-80 shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl overflow-hidden flex flex-col"
      >
        <HandRankingsPanel show-close-button @close="showHandRankings = false" />
      </aside>

      <!-- Center Arena -->
      <main class="relative flex-1 min-h-0 flex items-center justify-center">
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
          class="relative h-full w-full max-w-6xl"
        >
          <!-- Felt Oval -->
          <div
            class="absolute inset-x-[13%] inset-y-[13%] flex flex-col items-center justify-center rounded-[999px] border-[12px] border-zinc-900 bg-gradient-to-b from-emerald-900/90 via-emerald-950 to-zinc-950 shadow-[inset_0_0_70px_rgba(0,0,0,0.85),0_20px_50px_rgba(0,0,0,0.75)] ring-1 ring-emerald-500/30"
          >
            <!-- Inner Felt Line -->
            <div
              aria-hidden="true"
              class="pointer-events-none absolute inset-4 rounded-[999px] border border-emerald-400/20"
            />

            <!-- Decorative Suit Watermarks -->
            <div
              aria-hidden="true"
              class="pointer-events-none absolute inset-10 flex items-center justify-between px-10 text-emerald-400/10 text-4xl font-serif"
            >
              <span>♠ ♥</span>
              <span>♣ ♦</span>
            </div>

            <!-- Community Board Cards (Pre-Flop / Flop / Turn / River) -->
            <div class="relative z-10 flex flex-col items-center gap-2.5">
              <CommunityBoardSvg
                :street="tv.snapshot.value.table.street"
                :is-tournament-over="isTournamentOver"
              />

              <div class="mt-1 rounded-2xl border border-emerald-500/30 bg-zinc-950/85 px-6 py-2 text-center shadow-lg">
                <p class="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                  {{ t('totalPotLabel') }}
                </p>
                <p class="tabular-chips text-4xl font-black text-white leading-tight">
                  {{ formatChips(totalPot, locale) }}
                </p>
              </div>

              <div
                v-if="tv.snapshot.value.table.pots.length > 1"
                class="flex flex-wrap justify-center gap-2 px-6"
              >
                <div
                  v-for="pot in tv.snapshot.value.table.pots"
                  :key="pot.id"
                  class="rounded-xl border border-zinc-700/80 bg-zinc-950/90 px-3 py-1 text-xs"
                >
                  <span class="text-zinc-400">{{ pot.label }}: </span>
                  <span class="tabular-chips font-extrabold text-zinc-100">
                    {{ formatChips(pot.amount, locale) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Seats Ring -->
          <div
            v-for="(rawSeat, idx) in tv.snapshot.value.table.seats"
            :key="idx"
            :style="seatPositionStyle(idx, tv.snapshot.value.table.config.maxSeats)"
            class="absolute -translate-x-1/2 -translate-y-1/2 w-52 z-20"
          >
            <div
              v-if="rawSeat !== null"
              class="relative rounded-2xl border px-4 py-3 shadow-xl transition-all duration-300"
              :class="[
                tv.snapshot.value.table.actingSeatIndex === idx
                  ? 'border-amber-400 bg-zinc-900 ring-4 ring-amber-400/35 shadow-2xl shadow-amber-500/30 scale-110 z-30'
                  : 'border-zinc-800 bg-zinc-900/95',
                rawSeat.status === 'FOLDED' ||
                rawSeat.status === 'ELIMINATED' ||
                rawSeat.status === 'SITTING_OUT'
                  ? 'opacity-45'
                  : '',
              ]"
            >
              <!-- High-Contrast Active Turn Spotlight Badge -->
              <div
                v-if="tv.snapshot.value.table.actingSeatIndex === idx"
                class="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-950 shadow-lg animate-bounce"
              >
                ⚡
                {{
                  tv.turnRemainingSeconds.value !== null
                    ? `${t('activeTurnBadge')} • ${tv.turnRemainingSeconds.value}s`
                    : t('activeTurnBadge')
                }}
              </div>

              <div class="flex items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-mono text-xs font-bold text-zinc-500">
                    #{{ idx + 1 }}
                  </span>
                  <span class="truncate text-base font-bold text-zinc-100">
                    {{ rawSeat.name }}
                  </span>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <span
                    v-for="badge in roleBadges(idx)"
                    :key="badge"
                    class="rounded-full px-2 py-0.5 text-[10px] font-black"
                    :class="
                      badge === 'D'
                        ? 'bg-amber-400 text-zinc-950'
                        : badge === 'SB'
                          ? 'bg-sky-500/25 text-sky-300'
                          : 'bg-indigo-500/25 text-indigo-300'
                    "
                  >
                    {{ badge }}
                  </span>

                  <!-- 2 Hidden Face-Down Hole Cards for Active Players -->
                  <HoleCardsSvg
                    v-if="rawSeat.status === 'ACTIVE' || rawSeat.status === 'ALL_IN'"
                    size="sm"
                  />
                </div>
              </div>

              <div class="mt-1.5 flex items-baseline justify-between">
                <span class="tabular-chips text-xl font-black text-emerald-400">
                  {{ formatChips(rawSeat.stack, locale) }}
                </span>
                <span
                  v-if="rawSeat.status === 'ALL_IN'"
                  class="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white"
                >
                  {{ t('allInBadge') }}
                </span>
                <span
                  v-else-if="rawSeat.status === 'SITTING_OUT'"
                  class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                >
                  {{ t('sittingOutBadge') }}
                </span>
                <span
                  v-else-if="rawSeat.streetBet > 0"
                  class="tabular-chips rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-300"
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
      </main>

      <!-- Right Overlay Drawer: Live Tournament Standings / Leaderboard -->
      <aside
        v-if="showLeaderboard && tv.snapshot.value"
        class="w-72 shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl overflow-hidden flex flex-col"
      >
        <div class="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-2.5">
          <h2 class="text-sm font-extrabold uppercase tracking-wider text-amber-400">
            ★ {{ t('leaderboardTitle') }}
          </h2>
          <button
            type="button"
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-300"
            @click="showLeaderboard = false"
          >
            {{ t('closeBtn') }}
          </button>
        </div>

        <ol class="space-y-2 overflow-y-auto pr-1 flex-1">
          <li
            v-for="entry in tv.snapshot.value.leaderboard"
            :key="entry.playerId"
            class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
            :class="
              entry.isEliminated
                ? 'border-zinc-800/60 bg-zinc-950/50 opacity-50'
                : entry.rank === 1
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-zinc-800 bg-zinc-950/90'
            "
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
                :class="
                  entry.rank === 1
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300'
                "
              >
                {{ entry.rank }}
              </span>
              <span class="truncate font-bold text-white">
                {{ entry.playerName }}
              </span>
            </div>
            <span class="tabular-chips font-mono font-extrabold text-emerald-400 shrink-0">
              {{ entry.isEliminated ? t('eliminatedBadge') : formatChips(entry.chips, locale) }}
            </span>
          </li>
        </ol>
      </aside>
    </div>

    <AppFooterBar />
  </div>
</template>
