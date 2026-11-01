<script setup lang="ts">
import type { BettingActionType, Chips, LegalActions } from '@sidepot/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from '../i18n/index.js';
import { closeModalDialog, openModalDialog } from '../utils/dom-enhancements.js';
import { formatChips } from '../utils/format.js';

const props = defineProps<{
  legalActions: LegalActions;
  bigBlind: Chips;
}>();

const emit = defineEmits<{
  confirm: [action: BettingActionType, amount?: Chips];
}>();

const { locale, t } = useI18n();
const dialogEl = ref<HTMLDialogElement | null>(null);

const minWager = computed<Chips>(
  () => props.legalActions.minBetOrRaiseTo ?? props.legalActions.maxBetOrRaiseTo,
);
const maxWager = computed<Chips>(() => props.legalActions.maxBetOrRaiseTo);
const stepChip = computed<Chips>(() => Math.max(1, Math.floor(props.bigBlind / 2)));

const targetWager = ref<Chips>(minWager.value);

watch(
  () => [props.legalActions.minBetOrRaiseTo, props.legalActions.maxBetOrRaiseTo],
  () => {
    targetWager.value = minWager.value;
  },
  { immediate: true },
);

const presetButtons = computed(() => {
  const p = props.legalActions.presets;
  if (!p) {
    return [];
  }
  const items: { label: string; value: Chips }[] = [
    { label: t('presetMin'), value: p.minTo },
  ];
  if (p.twoPointFiveXTo !== null) {
    items.push({ label: t('preset25x'), value: p.twoPointFiveXTo });
  }
  if (p.halfPotTo !== null) {
    items.push({ label: t('presetHalfPot'), value: p.halfPotTo });
  }
  if (p.fullPotTo !== null) {
    items.push({ label: t('presetPot'), value: p.fullPotTo });
  }
  items.push({ label: t('presetAllIn'), value: p.allInTo });
  return items;
});

function adjustBy(delta: Chips): void {
  const next = Math.min(maxWager.value, Math.max(minWager.value, targetWager.value + delta));
  targetWager.value = next;
}

function submitWager(): void {
  const clamped = Math.min(
    maxWager.value,
    Math.max(minWager.value, Math.trunc(targetWager.value)),
  );
  if (clamped >= maxWager.value) {
    emit('confirm', 'ALL_IN');
  } else if (props.legalActions.canBet) {
    emit('confirm', 'BET', clamped);
  } else {
    emit('confirm', 'RAISE', clamped);
  }
  close();
}

function open(): void {
  targetWager.value = minWager.value;
  openModalDialog(dialogEl.value);
}

function close(): void {
  closeModalDialog(dialogEl.value);
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialogEl"
    closedby="any"
    aria-labelledby="raise-dialog-title"
    class="m-auto w-[min(94vw,26rem)] rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
  >
    <div class="space-y-5">
      <div class="flex items-center justify-between">
        <h2 id="raise-dialog-title" class="text-base font-bold">
          {{ t('raiseDialogTitle') }}
        </h2>
        <form method="dialog">
          <button
            type="submit"
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300"
          >
            {{ t('cancelBtn') }}
          </button>
        </form>
      </div>

      <div class="rounded-2xl border border-zinc-800 bg-zinc-950 py-4 text-center">
        <p class="tabular-chips text-3xl font-extrabold text-emerald-400">
          {{ formatChips(targetWager, locale) }}
        </p>
      </div>

      <div v-if="presetButtons.length > 0" class="flex flex-wrap gap-1.5">
        <button
          v-for="item in presetButtons"
          :key="item.label"
          type="button"
          class="flex-1 min-w-[4.2rem] rounded-xl border py-2 text-xs font-bold transition"
          :class="
            targetWager === item.value
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
              : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
          "
          @click="targetWager = item.value"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="space-y-3">
        <input
          v-model.number="targetWager"
          type="range"
          :min="minWager"
          :max="maxWager"
          :step="stepChip"
          aria-label="Bet amount slider"
          class="w-full cursor-pointer"
        />
        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200"
            @click="adjustBy(-bigBlind)"
          >
            −1 BB
          </button>
          <span class="tabular-chips text-xs text-zinc-400">
            {{ formatChips(minWager, locale) }} — {{ formatChips(maxWager, locale) }}
          </span>
          <button
            type="button"
            class="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-200"
            @click="adjustBy(bigBlind)"
          >
            +1 BB
          </button>
        </div>
      </div>

      <button
        type="button"
        autofocus
        class="tabular-chips w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-extrabold text-zinc-950 shadow-lg hover:bg-emerald-400"
        @click="submitWager"
      >
        {{
          t('confirmWagerBtn', {
            amount: formatChips(targetWager, locale),
          })
        }}
      </button>
    </div>
  </dialog>
</template>
