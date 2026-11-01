<script setup lang="ts">
import type {
  Player,
  PublicRoomSnapshot,
  SessionRole,
} from '@sidepot/core';
import { computed, ref } from 'vue';
import { useI18n } from '../i18n/index.js';
import { formatChips } from '../utils/format.js';

const props = defineProps<{
  snapshot: PublicRoomSnapshot;
  role: SessionRole | null;
  myPlayer: Player | null;
  isMyTurn: boolean;
  turnRemainingSeconds: number | null;
}>();

const emit = defineEmits<{
  seatSelf: [name: string];
}>();

const { locale, t } = useI18n();
const hostSeatName = ref('');

const occupiedSeats = computed<Player[]>(() =>
  props.snapshot.table.seats.filter((s): s is Player => s !== null),
);

const isBetweenHands = computed<boolean>(
  () =>
    props.snapshot.table.street === 'IDLE' ||
    props.snapshot.table.street === 'COMPLETE',
);

const championPlayer = computed<Player | null>(() => {
  if (props.snapshot.table.config.gameMode === 'CASH') {
    return null;
  }
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

function handleSeatSelfSubmit(): void {
  const trimmed = hostSeatName.value.trim();
  if (trimmed.length >= 2) {
    emit('seatSelf', trimmed);
    hostSeatName.value = '';
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-3">
    <!-- Champion Banner (Tournament Mode only) -->
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

    <!-- Between Hands Notice when Hand Complete -->
    <section
      v-else-if="snapshot.table.street === 'COMPLETE'"
      class="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2 text-center text-xs font-medium text-emerald-200"
    >
      ✓ {{ t('betweenHandsNotice') }}
    </section>

    <!-- Personal Player Hero Stack Card -->
    <section
      v-if="myPlayer"
      class="rounded-2xl border p-3.5 transition"
      :class="
        isMyTurn
          ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : 'border-zinc-800 bg-zinc-900/90'
      "
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="font-bold text-zinc-100">{{ myPlayer.name }}</span>
          <span
            v-for="b in seatBadges(myPlayer.seatIndex)"
            :key="b"
            class="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
            :class="
              b === 'D'
                ? 'bg-amber-400 text-zinc-950'
                : b === 'SB'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-indigo-500/20 text-indigo-300'
            "
          >
            {{ b }}
          </span>
          <span
            v-if="myPlayer.status === 'SITTING_OUT'"
            class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
          >
            {{ t('sittingOutBadge') }}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <span
            v-if="isMyTurn && turnRemainingSeconds !== null"
            class="rounded-full border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 font-mono text-xs font-extrabold text-amber-300"
          >
            ⏱ {{ turnRemainingSeconds }}s
          </span>
          <span
            v-if="isMyTurn"
            class="animate-pulse rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-extrabold text-zinc-950"
          >
            {{ t('yourTurnBanner') }}
          </span>
        </div>
      </div>

      <div class="mt-2.5 flex items-end justify-between">
        <div>
          <p class="text-[10px] uppercase tracking-wider text-zinc-400">
            {{ t('yourStackLabel') }}
          </p>
          <p class="tabular-chips text-2xl sm:text-3xl font-extrabold text-zinc-100">
            {{ formatChips(myPlayer.stack, locale) }}
          </p>
        </div>

        <div v-if="myPlayer.streetBet > 0" class="text-right">
          <p class="text-[10px] uppercase tracking-wider text-zinc-400">
            {{ t('streetBetLabel') }}
          </p>
          <p class="tabular-chips text-base font-bold text-amber-400">
            {{ formatChips(myPlayer.streetBet, locale) }}
          </p>
        </div>
      </div>
    </section>

    <!-- Unseated Host Quick Seat Bar (works on both IDLE and COMPLETE between hands) -->
    <section
      v-else-if="role === 'HOST' && isBetweenHands"
      class="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3.5"
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
  </div>
</template>
