<script setup lang="ts">
import type {
  BettingActionType,
  Chips,
  Player,
  PublicRoomSnapshot,
  SessionRole,
} from '@sidepot/core';
import { computed, ref } from 'vue';
import { useI18n } from '../i18n/index.js';
import {
  formatChips,
  formatClock,
  formatStreetBadge,
} from '../utils/format.js';
import RaiseSheetDialog from './RaiseSheetDialog.vue';

const props = defineProps<{
  snapshot: PublicRoomSnapshot;
  role: SessionRole | null;
  myPlayer: Player | null;
  isMyTurn: boolean;
  remainingSeconds: number;
}>();

const emit = defineEmits<{
  gameAction: [action: BettingActionType, amount?: Chips];
  seatSelf: [name: string];
}>();

const { locale, t } = useI18n();
const raiseDialogRef = ref<InstanceType<typeof RaiseSheetDialog> | null>(null);
const hostSeatName = ref('');

const currentBlindLevel = computed(() => {
  const sched = props.snapshot.table.config.blindSchedule;
  const idx = Math.min(
    sched.length - 1,
    Math.max(0, props.snapshot.table.blindLevelIndex),
  );
  return (
    sched[idx] ?? {
      level: 1,
      smallBlind: 25,
      bigBlind: 50,
      ante: 0,
      durationSeconds: 900,
    }
  );
});

const totalPot = computed<Chips>(() =>
  props.snapshot.table.pots.reduce((acc, pot) => acc + pot.amount, 0),
);

const occupiedSeats = computed<Player[]>(() =>
  props.snapshot.table.seats.filter((s): s is Player => s !== null),
);

const championPlayer = computed<Player | null>(() => {
  const champId = props.snapshot.table.championPlayerId;
  if (!champId) {
    return null;
  }
  return occupiedSeats.value.find((p) => p.id === champId) ?? null;
});

function seatBadges(seatIndex: number): string[] {
  const badges: string[] = [];
  if (props.snapshot.table.dealerSeatIndex === seatIndex) {
    badges.push('D');
  }
  if (props.snapshot.table.smallBlindSeatIndex === seatIndex) {
    badges.push('SB');
  }
  if (props.snapshot.table.bigBlindSeatIndex === seatIndex) {
    badges.push('BB');
  }
  return badges;
}

function isOnline(playerId: string): boolean {
  return props.snapshot.connectedPlayerIds.includes(playerId);
}

function openRaiseSheet(): void {
  raiseDialogRef.value?.open();
}

function handleSeatSelfSubmit(): void {
  const trimmed = hostSeatName.value.trim();
  if (trimmed.length >= 2) {
    emit('seatSelf', trimmed);
    hostSeatName.value = '';
  }
}
</script>

<template>
  <div class="space-y-4 pb-28">
    <!-- Top Blind Clock & Street Strip -->
    <section class="grid grid-cols-3 items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {{ t('blindLevelLabel', { level: currentBlindLevel.level }) }}
        </p>
        <p class="tabular-chips text-xs font-bold text-zinc-100">
          {{
            t('blindsDisplay', {
              sb: formatChips(currentBlindLevel.smallBlind, locale),
              bb: formatChips(currentBlindLevel.bigBlind, locale),
            })
          }}
        </p>
        <p v-if="currentBlindLevel.ante > 0" class="tabular-chips text-[11px] text-amber-400">
          {{ t('anteDisplay', { ante: formatChips(currentBlindLevel.ante, locale) }) }}
        </p>
      </div>

      <div class="text-center">
        <p
          class="tabular-chips font-mono text-xl font-extrabold"
          :class="
            remainingSeconds <= 60 && snapshot.blindClock.isRunning
              ? 'text-amber-400'
              : 'text-zinc-100'
          "
        >
          {{ formatClock(remainingSeconds) }}
        </p>
      </div>

      <div class="text-right">
        <p class="text-[11px] font-mono text-zinc-400">
          {{ t('handNumberLabel', { num: snapshot.table.handNumber }) }}
        </p>
        <span class="inline-block rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
          {{ formatStreetBadge(snapshot.table.street, locale) }}
        </span>
      </div>
    </section>

    <!-- Champion Banner -->
    <section
      v-if="championPlayer"
      class="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-center shadow-lg"
    >
      <p class="text-xs font-bold uppercase tracking-widest text-amber-400">
        ★ {{ t('championBannerTitle') }} ★
      </p>
      <p class="mt-1 text-2xl font-extrabold text-zinc-100">
        {{ championPlayer.name }}
      </p>
      <p class="tabular-chips mt-0.5 text-sm font-semibold text-amber-300">
        {{ formatChips(championPlayer.stack, locale) }}
      </p>
    </section>

    <!-- Live Main Pot & Side Pots Display -->
    <section class="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 text-center">
      <p class="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        {{ t('totalPotLabel') }}
      </p>
      <p class="tabular-chips mt-0.5 text-3xl font-extrabold text-emerald-400">
        {{ formatChips(totalPot, locale) }}
      </p>

      <div v-if="snapshot.table.pots.length > 0" class="mt-3 flex flex-wrap justify-center gap-2">
        <div
          v-for="pot in snapshot.table.pots"
          :key="pot.id"
          class="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs"
        >
          <span class="text-zinc-400">{{ pot.label }}: </span>
          <span class="tabular-chips font-bold text-zinc-100">
            {{ formatChips(pot.amount, locale) }}
          </span>
        </div>
      </div>
    </section>

    <!-- Personal Player Hero Stack Card -->
    <section
      v-if="myPlayer"
      class="rounded-2xl border p-4 transition"
      :class="
        isMyTurn
          ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : 'border-zinc-800 bg-zinc-900'
      "
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-bold text-zinc-100">{{ myPlayer.name }}</span>
          <span
            v-for="b in seatBadges(myPlayer.seatIndex)"
            :key="b"
            class="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
            :class="
              b === 'D'
                ? 'bg-zinc-100 text-zinc-950'
                : b === 'SB'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-indigo-500/20 text-indigo-300'
            "
          >
            {{ b }}
          </span>
        </div>
        <span
          v-if="isMyTurn"
          class="animate-pulse rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-extrabold text-zinc-950"
        >
          {{ t('yourTurnBanner') }}
        </span>
      </div>

      <div class="mt-3 flex items-end justify-between">
        <div>
          <p class="text-[11px] uppercase tracking-wider text-zinc-400">
            {{ t('yourStackLabel') }}
          </p>
          <p class="tabular-chips text-3xl font-extrabold text-zinc-100">
            {{ formatChips(myPlayer.stack, locale) }}
          </p>
        </div>

        <div v-if="myPlayer.streetBet > 0" class="text-right">
          <p class="text-[11px] uppercase tracking-wider text-zinc-400">
            {{ t('streetBetLabel') }}
          </p>
          <p class="tabular-chips text-base font-bold text-amber-400">
            {{ formatChips(myPlayer.streetBet, locale) }}
          </p>
        </div>
      </div>
    </section>

    <!-- Unseated Host Quick Seat Bar -->
    <section
      v-else-if="role === 'HOST' && snapshot.table.street === 'IDLE'"
      class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
    >
      <p class="mb-2 text-xs font-semibold text-zinc-400">
        {{ t('spectatorHostMode') }}
      </p>
      <form class="flex gap-2" @submit.prevent="handleSeatSelfSubmit">
        <input
          v-model="hostSeatName"
          type="text"
          minlength="2"
          maxlength="24"
          :placeholder="t('playerNameLabel')"
          class="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
        />
        <button
          type="submit"
          class="rounded-xl bg-zinc-800 px-3.5 py-2 text-xs font-bold text-emerald-400 hover:bg-zinc-700"
        >
          {{ t('seatSelfBtn') }}
        </button>
      </form>
    </section>

    <!-- Compact Table Seat Ring -->
    <section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div
        v-for="seat in occupiedSeats"
        :key="seat.id"
        class="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition"
        :class="[
          snapshot.table.actingSeatIndex === seat.seatIndex
            ? 'border-emerald-400 bg-emerald-500/10'
            : 'border-zinc-800 bg-zinc-900/70',
          seat.status === 'FOLDED' || seat.status === 'ELIMINATED'
            ? 'opacity-50'
            : '',
        ]"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :class="isOnline(seat.id) ? 'bg-emerald-400' : 'bg-zinc-600'"
          />
          <span class="truncate font-semibold text-zinc-100">
            {{ seat.name }}
          </span>
          <span
            v-for="b in seatBadges(seat.seatIndex)"
            :key="b"
            class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
            :class="
              b === 'D'
                ? 'bg-zinc-100 text-zinc-950'
                : 'bg-zinc-800 text-zinc-300'
            "
          >
            {{ b }}
          </span>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
          <span
            v-if="seat.status === 'ALL_IN'"
            class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300"
          >
            {{ t('allInBadge') }}
          </span>
          <span
            v-else-if="seat.status === 'FOLDED'"
            class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400"
          >
            {{ t('foldedBadge') }}
          </span>
          <span
            v-else-if="seat.streetBet > 0"
            class="tabular-chips text-xs font-semibold text-amber-400"
          >
            {{ formatChips(seat.streetBet, locale) }}
          </span>

          <span class="tabular-chips font-bold text-zinc-100">
            {{ formatChips(seat.stack, locale) }}
          </span>
        </div>
      </div>
    </section>

    <!-- Ergonomic One-Handed Bottom Action Bar -->
    <div
      v-if="isMyTurn && snapshot.legalActions"
      class="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 px-4 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] backdrop-blur"
    >
      <div class="mx-auto grid max-w-lg grid-cols-3 gap-2.5">
        <button
          v-if="snapshot.legalActions.canFold"
          type="button"
          class="min-h-14 rounded-2xl border border-rose-500/40 bg-rose-500/15 text-sm font-extrabold text-rose-300 active:scale-[0.98]"
          @click="emit('gameAction', 'FOLD')"
        >
          {{ t('actionFold') }}
        </button>

        <button
          v-if="snapshot.legalActions.canCheck"
          type="button"
          class="min-h-14 rounded-2xl border border-emerald-500/40 bg-zinc-800 text-sm font-extrabold text-emerald-300 active:scale-[0.98]"
          @click="emit('gameAction', 'CHECK')"
        >
          {{ t('actionCheck') }}
        </button>

        <button
          v-else-if="snapshot.legalActions.canCall"
          type="button"
          class="tabular-chips min-h-14 rounded-2xl bg-emerald-500 px-2 text-sm font-extrabold text-zinc-950 active:scale-[0.98]"
          @click="emit('gameAction', 'CALL')"
        >
          {{
            t('actionCall', {
              amount: formatChips(snapshot.legalActions.callDelta, locale),
            })
          }}
        </button>

        <button
          v-if="snapshot.legalActions.canBet || snapshot.legalActions.canRaise"
          type="button"
          class="min-h-14 rounded-2xl bg-amber-500 text-sm font-extrabold text-zinc-950 active:scale-[0.98]"
          @click="openRaiseSheet"
        >
          {{
            snapshot.legalActions.canBet ? t('actionBet') : t('actionRaise')
          }}
        </button>

        <button
          v-else-if="snapshot.legalActions.canAllIn"
          type="button"
          class="tabular-chips min-h-14 rounded-2xl bg-amber-500 px-2 text-xs font-extrabold text-zinc-950 active:scale-[0.98]"
          @click="emit('gameAction', 'ALL_IN')"
        >
          {{
            t('actionAllIn', {
              amount: formatChips(snapshot.legalActions.maxBetOrRaiseTo, locale),
            })
          }}
        </button>
      </div>
    </div>

    <RaiseSheetDialog
      v-if="snapshot.legalActions"
      ref="raiseDialogRef"
      :legal-actions="snapshot.legalActions"
      :big-blind="currentBlindLevel.bigBlind"
      @confirm="(act, amt) => emit('gameAction', act, amt)"
    />
  </div>
</template>
