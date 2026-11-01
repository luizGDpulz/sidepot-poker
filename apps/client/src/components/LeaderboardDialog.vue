<script setup lang="ts">
import type { LeaderboardEntry } from '@sidepot/core';
import { ref } from 'vue';
import { useI18n } from '../i18n/index.js';
import { closeModalDialog, openModalDialog } from '../utils/dom-enhancements.js';
import { formatChips } from '../utils/format.js';

defineProps<{
  entries: readonly LeaderboardEntry[];
}>();

const { locale, t } = useI18n();
const dialogEl = ref<HTMLDialogElement | null>(null);

function open(): void {
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
    aria-labelledby="leaderboard-dialog-title"
    class="m-auto w-[min(94vw,28rem)] rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 id="leaderboard-dialog-title" class="text-base font-bold">
          {{ t('leaderboardTitle') }}
        </h2>
        <form method="dialog">
          <button
            type="submit"
            autofocus
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200"
          >
            {{ t('closeBtn') }}
          </button>
        </form>
      </div>

      <ul class="max-h-[60dvh] divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950">
        <li
          v-for="entry in entries"
          :key="entry.playerId"
          class="flex items-center justify-between px-3.5 py-2.5 text-sm"
          :class="entry.isEliminated ? 'opacity-55' : ''"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="tabular-chips inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
              :class="
                entry.rank === 1
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-300'
              "
            >
              {{ entry.rank }}
            </span>
            <div>
              <p class="font-semibold text-zinc-100">
                {{ entry.playerName }}
                <span v-if="entry.isChampion" class="ml-1 text-amber-400">★</span>
              </p>
              <p v-if="entry.rebuyCount > 0 || entry.addOnCount > 0" class="text-[11px] text-zinc-400">
                <span v-if="entry.rebuyCount > 0">R:{{ entry.rebuyCount }} </span>
                <span v-if="entry.addOnCount > 0">A:{{ entry.addOnCount }}</span>
              </p>
            </div>
          </div>

          <span
            v-if="!entry.isEliminated"
            class="tabular-chips font-bold text-emerald-400"
          >
            {{ formatChips(entry.chips, locale) }}
          </span>
          <span v-else class="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
            {{ t('eliminatedBadge') }}
          </span>
        </li>
      </ul>
    </div>
  </dialog>
</template>
