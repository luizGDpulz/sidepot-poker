<script setup lang="ts">
import { computed } from 'vue';
import { useI18n, type TranslationKey } from '../i18n/index.js';

defineProps<{
  showCloseButton?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

interface MiniCardSpec {
  readonly rank: string;
  readonly suit: '♠' | '♥' | '♦' | '♣';
  readonly highlight?: boolean;
}

interface HandRankingItem {
  readonly order: number;
  readonly nameKey: TranslationKey;
  readonly descKey: TranslationKey;
  readonly cards: readonly MiniCardSpec[];
}

const RANKINGS = computed<readonly HandRankingItem[]>(() => [
  {
    order: 1,
    nameKey: 'rank1Name',
    descKey: 'rank1Desc',
    cards: [
      { rank: 'A', suit: '♠', highlight: true },
      { rank: 'K', suit: '♠', highlight: true },
      { rank: 'Q', suit: '♠', highlight: true },
      { rank: 'J', suit: '♠', highlight: true },
      { rank: '10', suit: '♠', highlight: true },
    ],
  },
  {
    order: 2,
    nameKey: 'rank2Name',
    descKey: 'rank2Desc',
    cards: [
      { rank: '9', suit: '♥', highlight: true },
      { rank: '8', suit: '♥', highlight: true },
      { rank: '7', suit: '♥', highlight: true },
      { rank: '6', suit: '♥', highlight: true },
      { rank: '5', suit: '♥', highlight: true },
    ],
  },
  {
    order: 3,
    nameKey: 'rank3Name',
    descKey: 'rank3Desc',
    cards: [
      { rank: 'A', suit: '♠', highlight: true },
      { rank: 'A', suit: '♥', highlight: true },
      { rank: 'A', suit: '♦', highlight: true },
      { rank: 'A', suit: '♣', highlight: true },
      { rank: 'K', suit: '♠' },
    ],
  },
  {
    order: 4,
    nameKey: 'rank4Name',
    descKey: 'rank4Desc',
    cards: [
      { rank: 'K', suit: '♠', highlight: true },
      { rank: 'K', suit: '♥', highlight: true },
      { rank: 'K', suit: '♦', highlight: true },
      { rank: 'Q', suit: '♣', highlight: true },
      { rank: 'Q', suit: '♠', highlight: true },
    ],
  },
  {
    order: 5,
    nameKey: 'rank5Name',
    descKey: 'rank5Desc',
    cards: [
      { rank: 'A', suit: '♦', highlight: true },
      { rank: 'J', suit: '♦', highlight: true },
      { rank: '8', suit: '♦', highlight: true },
      { rank: '5', suit: '♦', highlight: true },
      { rank: '2', suit: '♦', highlight: true },
    ],
  },
  {
    order: 6,
    nameKey: 'rank6Name',
    descKey: 'rank6Desc',
    cards: [
      { rank: '10', suit: '♠', highlight: true },
      { rank: '9', suit: '♦', highlight: true },
      { rank: '8', suit: '♣', highlight: true },
      { rank: '7', suit: '♥', highlight: true },
      { rank: '6', suit: '♠', highlight: true },
    ],
  },
  {
    order: 7,
    nameKey: 'rank7Name',
    descKey: 'rank7Desc',
    cards: [
      { rank: 'Q', suit: '♠', highlight: true },
      { rank: 'Q', suit: '♥', highlight: true },
      { rank: 'Q', suit: '♣', highlight: true },
      { rank: '9', suit: '♦' },
      { rank: '4', suit: '♠' },
    ],
  },
  {
    order: 8,
    nameKey: 'rank8Name',
    descKey: 'rank8Desc',
    cards: [
      { rank: 'J', suit: '♠', highlight: true },
      { rank: 'J', suit: '♦', highlight: true },
      { rank: '8', suit: '♣', highlight: true },
      { rank: '8', suit: '♥', highlight: true },
      { rank: 'A', suit: '♠' },
    ],
  },
  {
    order: 9,
    nameKey: 'rank9Name',
    descKey: 'rank9Desc',
    cards: [
      { rank: '10', suit: '♠', highlight: true },
      { rank: '10', suit: '♥', highlight: true },
      { rank: 'K', suit: '♦' },
      { rank: '7', suit: '♣' },
      { rank: '3', suit: '♠' },
    ],
  },
  {
    order: 10,
    nameKey: 'rank10Name',
    descKey: 'rank10Desc',
    cards: [
      { rank: 'A', suit: '♠', highlight: true },
      { rank: 'J', suit: '♦' },
      { rank: '8', suit: '♣' },
      { rank: '5', suit: '♥' },
      { rank: '2', suit: '♠' },
    ],
  },
]);
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 mb-2.5">
      <div>
        <h2 class="text-sm font-extrabold uppercase tracking-wider text-emerald-400">
          🃏 {{ t('handRankingsTitle') }}
        </h2>
        <p class="text-[11px] text-slate-400">
          {{ t('handRankingsSubtitle') }}
        </p>
      </div>
      <button
        v-if="showCloseButton"
        type="button"
        class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
        @click="emit('close')"
      >
        {{ t('closeBtn') }}
      </button>
    </div>

    <ol class="space-y-1.5 overflow-y-auto pr-1 flex-1">
      <li
        v-for="item in RANKINGS"
        :key="item.order"
        class="flex items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/75 px-2.5 py-1.5"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span
              class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
              :class="
                item.order <= 3
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              "
            >
              {{ item.order }}
            </span>
            <p class="truncate text-xs font-bold text-white">
              {{ t(item.nameKey) }}
            </p>
          </div>
          <p class="mt-0.5 truncate text-[10px] text-slate-400">
            {{ t(item.descKey) }}
          </p>
        </div>

        <!-- 5 Mini Sample Cards -->
        <div class="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          <span
            v-for="(c, cIdx) in item.cards"
            :key="cIdx"
            class="inline-flex h-7 w-5 flex-col items-center justify-center rounded border text-[9px] font-black leading-none"
            :class="[
              c.highlight
                ? 'border-white bg-white shadow-sm'
                : 'border-slate-700 bg-slate-900/90 opacity-45',
              c.suit === '♥' || c.suit === '♦'
                ? c.highlight
                  ? 'text-rose-600'
                  : 'text-rose-400'
                : c.highlight
                  ? 'text-slate-900'
                  : 'text-slate-300',
            ]"
          >
            <span>{{ c.rank }}</span>
            <span class="text-[8px]">{{ c.suit }}</span>
          </span>
        </div>
      </li>
    </ol>
  </div>
</template>
