<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId, PublicRoomSnapshot } from '@sidepot/core';
import { useI18n } from '../i18n/index.js';
import { formatChips } from '../utils/format.js';
import CommunityBoardSvg from './CommunityBoardSvg.vue';
import HoleCardsSvg from './HoleCardsSvg.vue';

const props = defineProps<{
  snapshot: PublicRoomSnapshot;
  myPlayerId: PlayerId | null;
  isHost: boolean;
  turnRemainingSeconds: number | null;
}>();

const emit = defineEmits<{
  selectPlayer: [playerId: PlayerId];
}>();

const { locale, t } = useI18n();

const table = computed(() => props.snapshot.table);

const totalPot = computed(() => {
  const fromPots = table.value.pots.reduce((acc, p) => acc + p.amount, 0);
  if (fromPots > 0) return fromPots;
  return table.value.seats.reduce((acc, s) => acc + (s ? s.handContribution : 0), 0);
});

const isTournamentOver = computed(
  () => table.value.championPlayerId !== null && table.value.config.gameMode !== 'CASH',
);

function getSeatPositionStyle(
  index: number,
  total: number,
): Readonly<Record<string, string>> {
  const angleRad = (2 * Math.PI * index) / total - Math.PI / 2;
  const rx = 42;
  const ry = 38;
  const left = 50 + rx * Math.cos(angleRad);
  const top = 50 + ry * Math.sin(angleRad);
  return {
    left: `${left.toFixed(2)}%`,
    top: `${top.toFixed(2)}%`,
  };
}
</script>

<template>
  <section
    class="relative mx-auto w-full max-w-3xl select-none py-3 px-2 sm:px-4"
    aria-label="Poker table overview"
  >
    <div class="relative aspect-[16/10] sm:aspect-[16/9] w-full">
      <!-- Outer Table Rail & Emerald Felt -->
      <div
        class="absolute inset-[10%] sm:inset-[11%] rounded-[999px] border-[6px] sm:border-[10px] border-slate-900 bg-gradient-to-b from-emerald-900/90 via-emerald-950 to-slate-950 shadow-[inset_0_0_45px_rgba(0,0,0,0.85),0_12px_35px_rgba(0,0,0,0.65)] ring-1 ring-emerald-500/30 flex flex-col items-center justify-center p-2"
      >
        <!-- Inner Felt Trim Ring -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-2.5 sm:inset-3.5 rounded-[999px] border border-emerald-400/20"
        />

        <!-- Decorative Corner Suit Watermarks -->
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-6 flex items-center justify-between px-6 text-emerald-400/10 text-xl sm:text-2xl font-serif"
        >
          <span>♠ ♥</span>
          <span>♣ ♦</span>
        </div>

        <!-- Center Community Cards & Pot Display -->
        <div class="relative z-10 flex flex-col items-center gap-1.5 text-center">
          <CommunityBoardSvg
            :street="table.street"
            :is-tournament-over="isTournamentOver"
            compact
          />

          <div
            class="mt-0.5 rounded-xl border border-emerald-500/30 bg-slate-950/80 px-3 py-1 shadow-md"
          >
            <p class="text-[9px] font-bold uppercase tracking-widest text-emerald-400/90">
              {{ t('totalPotLabel') }}
            </p>
            <p class="font-mono text-sm sm:text-lg font-extrabold tabular-nums text-white leading-tight">
              {{ formatChips(totalPot, locale) }}
            </p>
          </div>

          <!-- Side Pots -->
          <div
            v-if="table.pots.length > 1"
            class="flex flex-wrap justify-center gap-1"
          >
            <span
              v-for="(pot, idx) in table.pots"
              :key="pot.id"
              class="rounded-md border border-slate-700 bg-slate-900/90 px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums text-slate-300"
            >
              {{ idx === 0 ? 'Main' : `Side #${String(idx)}` }}:
              {{ formatChips(pot.amount, locale) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Seat Ring Nodes -->
      <div
        v-for="(rawSeat, idx) in table.seats"
        :key="idx"
        :style="getSeatPositionStyle(idx, table.seats.length)"
        class="absolute -translate-x-1/2 -translate-y-1/2 z-20"
      >
        <button
          v-if="rawSeat !== null"
          type="button"
          :disabled="!isHost"
          class="group relative w-24 sm:w-32 rounded-xl border px-2 py-1.5 text-left transition-all duration-200"
          :class="[
            table.actingSeatIndex === idx
              ? 'border-amber-400 bg-slate-900/95 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/25 scale-105 z-30'
              : rawSeat.id === myPlayerId
                ? 'border-emerald-500/70 bg-slate-900/95 ring-1 ring-emerald-500/30'
                : rawSeat.status === 'FOLDED' ||
                    rawSeat.status === 'ELIMINATED' ||
                    rawSeat.status === 'SITTING_OUT'
                  ? 'border-slate-800/80 bg-slate-950/75 opacity-60'
                  : 'border-slate-700/90 bg-slate-900/90',
            isHost ? 'cursor-pointer hover:border-emerald-400' : 'cursor-default',
          ]"
          @click="isHost && emit('selectPlayer', rawSeat.id)"
        >
          <!-- Active Turn Floating Spotlight Pill -->
          <div
            v-if="table.actingSeatIndex === idx"
            class="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider text-slate-950 shadow"
          >
            ⚡ {{ turnRemainingSeconds !== null ? `${turnRemainingSeconds}s` : t('activeTurnBadge') }}
          </div>

          <!-- Top Row: Pucks + Hidden Hole Cards -->
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-0.5">
              <span
                class="font-mono text-[9px] font-bold text-slate-500"
              >
                #{{ idx + 1 }}
              </span>
              <span
                v-if="table.dealerSeatIndex === idx"
                class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-slate-950"
              >
                D
              </span>
              <span
                v-if="table.smallBlindSeatIndex === idx"
                class="rounded bg-sky-500/25 px-1 text-[8px] font-bold text-sky-300"
              >
                SB
              </span>
              <span
                v-if="table.bigBlindSeatIndex === idx"
                class="rounded bg-indigo-500/25 px-1 text-[8px] font-bold text-indigo-300"
              >
                BB
              </span>
            </div>

            <!-- 2 Hidden Hole Cards for Active Players -->
            <HoleCardsSvg
              v-if="rawSeat.status === 'ACTIVE' || rawSeat.status === 'ALL_IN'"
              size="sm"
            />
          </div>

          <!-- Player Name & Stack -->
          <p class="mt-0.5 truncate text-[11px] sm:text-xs font-bold text-white">
            {{ rawSeat.name }}
          </p>
          <div class="flex items-baseline justify-between gap-1">
            <span class="font-mono text-xs sm:text-sm font-extrabold tabular-nums text-emerald-400">
              {{ formatChips(rawSeat.stack, locale) }}
            </span>

            <span
              v-if="rawSeat.streetBet > 0"
              class="rounded bg-amber-500/20 px-1 font-mono text-[9px] font-bold tabular-nums text-amber-300"
            >
              {{ formatChips(rawSeat.streetBet, locale) }}
            </span>
          </div>

          <!-- Status Badges -->
          <div
            v-if="
              rawSeat.status === 'ALL_IN' ||
              rawSeat.status === 'FOLDED' ||
              rawSeat.status === 'SITTING_OUT' ||
              rawSeat.status === 'ELIMINATED'
            "
            class="mt-0.5"
          >
            <span
              v-if="rawSeat.status === 'ALL_IN'"
              class="inline-block rounded bg-rose-500/25 px-1 text-[8px] font-extrabold text-rose-300"
            >
              {{ t('allInBadge') }}
            </span>
            <span
              v-else-if="rawSeat.status === 'FOLDED'"
              class="inline-block rounded bg-slate-800 px-1 text-[8px] font-bold text-slate-400"
            >
              {{ t('foldedBadge') }}
            </span>
            <span
              v-else-if="rawSeat.status === 'SITTING_OUT'"
              class="inline-block rounded bg-amber-500/20 px-1 text-[8px] font-bold text-amber-300"
            >
              {{ t('sittingOutBadge') }}
            </span>
            <span
              v-else-if="rawSeat.status === 'ELIMINATED'"
              class="inline-block rounded bg-rose-950/90 px-1 text-[8px] font-bold text-rose-400"
            >
              {{ t('eliminatedBadge') }}
            </span>
          </div>
        </button>

        <!-- Empty Seat Pill -->
        <div
          v-else
          class="rounded-full border border-dashed border-slate-800/80 bg-slate-950/60 px-2 py-0.5 text-[9px] font-medium text-slate-600"
        >
          #{{ idx + 1 }}
        </div>
      </div>
    </div>
  </section>
</template>
