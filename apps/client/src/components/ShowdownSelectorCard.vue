<script setup lang="ts">
import type { Player, PlayerId, Pot } from '@sidepot/core';
import { computed, reactive, watch } from 'vue';
import { useI18n } from '../i18n/index.js';
import { formatChips } from '../utils/format.js';

const props = defineProps<{
  pots: readonly Pot[];
  seats: readonly (Player | null)[];
}>();

const emit = defineEmits<{
  resolve: [winnersByPotId: Readonly<Record<string, readonly PlayerId[]>>];
}>();

const { locale, t } = useI18n();

const selectedByPot = reactive<Record<string, PlayerId[]>>({});

const playerById = computed(() => {
  const map = new Map<PlayerId, Player>();
  for (const s of props.seats) {
    if (s) {
      map.set(s.id, s);
    }
  }
  return map;
});

watch(
  () => props.pots,
  (pots) => {
    for (const pot of pots) {
      if (!selectedByPot[pot.id]) {
        selectedByPot[pot.id] =
          pot.eligiblePlayerIds.length === 1 && pot.eligiblePlayerIds[0]
            ? [pot.eligiblePlayerIds[0]]
            : [];
      }
    }
  },
  { immediate: true },
);

function isSelected(potId: string, pid: PlayerId): boolean {
  return (selectedByPot[potId] ?? []).includes(pid);
}

function toggleWinner(potId: string, pid: PlayerId): void {
  const current = selectedByPot[potId] ?? [];
  if (current.includes(pid)) {
    selectedByPot[potId] = current.filter((id) => id !== pid);
  } else {
    selectedByPot[potId] = [...current, pid];
  }
}

const isReadyToAward = computed<boolean>(() =>
  props.pots.every((pot) => (selectedByPot[pot.id]?.length ?? 0) >= 1),
);

function handleAward(): void {
  if (!isReadyToAward.value) {
    return;
  }
  const payload: Record<string, readonly PlayerId[]> = {};
  for (const pot of props.pots) {
    payload[pot.id] = [...(selectedByPot[pot.id] ?? [])];
  }
  emit('resolve', payload);
}
</script>

<template>
  <section class="space-y-4 rounded-2xl border border-amber-500/50 bg-zinc-900 p-4 shadow-xl">
    <div>
      <h2 class="text-base font-extrabold text-amber-400">
        {{ t('showdownTitle') }}
      </h2>
      <p class="mt-0.5 text-xs text-zinc-400">
        {{ t('showdownSubtitle') }}
      </p>
    </div>

    <div class="space-y-3">
      <div
        v-for="pot in pots"
        :key="pot.id"
        class="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold uppercase tracking-wider text-zinc-300">
            {{ pot.label }}
          </span>
          <span class="tabular-chips text-sm font-extrabold text-emerald-400">
            {{ formatChips(pot.amount, locale) }}
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="pid in pot.eligiblePlayerIds"
            :key="pid"
            type="button"
            class="rounded-xl border px-3 py-2 text-xs font-bold transition"
            :class="
              isSelected(pot.id, pid)
                ? 'border-emerald-400 bg-emerald-500 text-zinc-950'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
            "
            @click="toggleWinner(pot.id, pid)"
          >
            {{ playerById.get(pid)?.name ?? pid }}
          </button>
        </div>
      </div>
    </div>

    <button
      type="button"
      :disabled="!isReadyToAward"
      class="w-full rounded-xl bg-amber-500 py-3 text-sm font-extrabold text-zinc-950 shadow-lg transition hover:bg-amber-400 disabled:opacity-40"
      @click="handleAward"
    >
      {{ t('distributePotsBtn') }}
    </button>
  </section>
</template>
