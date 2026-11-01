<script setup lang="ts">
import { computed } from 'vue';
import type { TableLogEntry } from '@sidepot/core';
import { useI18n } from '../i18n/index.js';

const props = defineProps<{
  entries: readonly TableLogEntry[];
  showCloseButton?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();

const reversedEntries = computed(() => [...props.entries].reverse());

function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
</script>

<template>
  <aside
    class="flex h-full flex-col overflow-hidden"
    aria-label="Table action timeline"
  >
    <div class="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-3 py-2.5">
      <div class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
        <h2 class="text-xs font-extrabold uppercase tracking-wider text-slate-300">
          {{ t('timelineTitle') }}
        </h2>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-400">
          {{ entries.length }}
        </span>
        <button
          v-if="showCloseButton"
          type="button"
          class="rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
          @click="emit('close')"
        >
          {{ t('closeBtn') }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto overscroll-contain p-2.5">
      <p
        v-if="reversedEntries.length === 0"
        class="py-6 text-center text-xs text-slate-500"
      >
        {{ t('timelineEmpty') }}
      </p>

      <ol v-else class="space-y-1.5">
        <li
          v-for="item in reversedEntries"
          :key="item.id"
          class="rounded-xl border border-slate-800/80 bg-slate-950/70 px-2.5 py-1.5 text-xs"
        >
          <div class="flex items-center justify-between gap-1 text-[10px] text-slate-500">
            <div class="flex items-center gap-1">
              <span
                v-if="item.handNumber > 0"
                class="rounded bg-emerald-500/15 px-1 font-mono font-bold text-emerald-400"
              >
                #{{ item.handNumber }}
              </span>
              <span class="font-mono uppercase">{{ item.street }}</span>
            </div>
            <time class="font-mono tabular-nums">
              {{ formatTime(item.timestampMs) }}
            </time>
          </div>
          <p class="mt-0.5 font-medium text-slate-200 break-words">
            {{ item.message }}
          </p>
        </li>
      </ol>
    </div>
  </aside>
</template>
