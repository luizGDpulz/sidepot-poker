<script setup lang="ts">
import { computed } from 'vue';
import type { HandStreet } from '@sidepot/core';
import { useI18n } from '../i18n/index.js';
import { formatStreetBadge } from '../utils/format.js';

const props = withDefaults(
  defineProps<{
    street: HandStreet;
    isTournamentOver?: boolean;
    compact?: boolean;
  }>(),
  {
    isTournamentOver: false,
    compact: false,
  },
);

const { locale } = useI18n();

const revealedCount = computed<number>(() => {
  switch (props.street) {
    case 'FLOP':
      return 3;
    case 'TURN':
      return 4;
    case 'RIVER':
    case 'SHOWDOWN':
      return 5;
    default:
      return 0;
  }
});

interface BoardCardSlot {
  readonly index: number;
  readonly stageTag: string;
  readonly suitSymbol: string;
  readonly suitColorClass: string;
  readonly isRevealed: boolean;
  readonly isCurrentStreetCard: boolean;
}

const boardSlots = computed<readonly BoardCardSlot[]>(() => {
  const count = revealedCount.value;
  const specs = [
    { stageTag: 'FLOP', suitSymbol: '♠', suitColorClass: 'text-slate-900' },
    { stageTag: 'FLOP', suitSymbol: '♥', suitColorClass: 'text-rose-600' },
    { stageTag: 'FLOP', suitSymbol: '♦', suitColorClass: 'text-rose-600' },
    { stageTag: 'TURN', suitSymbol: '♣', suitColorClass: 'text-slate-900' },
    { stageTag: 'RIVER', suitSymbol: '♠', suitColorClass: 'text-emerald-700' },
  ] as const;

  return specs.map((spec, idx) => {
    const isRevealed = idx < count;
    const isCurrentStreetCard =
      (props.street === 'FLOP' && idx < 3) ||
      (props.street === 'TURN' && idx === 3) ||
      ((props.street === 'RIVER' || props.street === 'SHOWDOWN') && idx === 4);

    return {
      index: idx,
      stageTag: spec.stageTag,
      suitSymbol: spec.suitSymbol,
      suitColorClass: spec.suitColorClass,
      isRevealed,
      isCurrentStreetCard,
    };
  });
});

const streetLabel = computed(() =>
  formatStreetBadge(props.street, locale.value, props.isTournamentOver),
);
</script>

<template>
  <div class="flex flex-col items-center gap-1.5 select-none">
    <!-- Street Stage Pill -->
    <div
      class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-bold uppercase tracking-widest transition"
      :class="[
        compact ? 'text-[10px]' : 'text-xs',
        street === 'SHOWDOWN'
          ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
          : street === 'PREFLOP' ||
              street === 'FLOP' ||
              street === 'TURN' ||
              street === 'RIVER'
            ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
            : 'border-slate-700 bg-slate-900/80 text-slate-300',
      ]"
    >
      <span
        class="h-1.5 w-1.5 rounded-full"
        :class="
          street === 'IDLE' || street === 'COMPLETE'
            ? 'bg-slate-400'
            : 'bg-emerald-400 animate-pulse'
        "
      />
      <span>{{ streetLabel }}</span>
    </div>

    <!-- 5 Community Card Slots -->
    <div
      class="flex items-center justify-center"
      :class="compact ? 'gap-1.5' : 'gap-2.5'"
      aria-hidden="true"
    >
      <div
        v-for="slot in boardSlots"
        :key="slot.index"
        class="relative flex flex-col items-center justify-between rounded-lg transition-all duration-300"
        :class="[
          compact ? 'h-11 w-8 p-1' : 'h-16 w-12 p-1.5',
          slot.isRevealed
            ? slot.isCurrentStreetCard
              ? 'bg-white shadow-lg shadow-emerald-500/30 ring-2 ring-amber-400 -translate-y-0.5'
              : 'bg-slate-100 shadow-md ring-1 ring-white/80'
            : 'border border-dashed border-emerald-500/35 bg-emerald-950/50 text-emerald-500/35',
        ]"
      >
        <template v-if="slot.isRevealed">
          <span
            class="self-start font-black leading-none tracking-tighter"
            :class="[
              compact ? 'text-[7px]' : 'text-[9px]',
              slot.suitColorClass,
            ]"
          >
            {{ slot.stageTag }}
          </span>
          <span
            class="leading-none"
            :class="[
              compact ? 'text-sm' : 'text-xl',
              slot.suitColorClass,
            ]"
          >
            {{ slot.suitSymbol }}
          </span>
          <span
            class="self-end font-mono font-bold leading-none text-slate-400"
            :class="compact ? 'text-[7px]' : 'text-[8px]'"
          >
            #{{ slot.index + 1 }}
          </span>
        </template>

        <template v-else>
          <span
            class="font-mono font-bold uppercase opacity-60"
            :class="compact ? 'text-[7px]' : 'text-[8px]'"
          >
            {{ slot.stageTag }}
          </span>
          <span :class="compact ? 'text-xs' : 'text-base'">
            {{ slot.suitSymbol }}
          </span>
          <span
            class="font-mono opacity-40"
            :class="compact ? 'text-[7px]' : 'text-[8px]'"
          >
            •
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
