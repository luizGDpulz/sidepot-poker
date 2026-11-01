<script setup lang="ts">
import { useI18n } from '../i18n/index.js';
import type { BouncerClientStatus } from '../stores/room-store.js';

defineProps<{
  status: BouncerClientStatus;
  roomId: string;
}>();

const emit = defineEmits<{
  backHome: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="mx-auto flex min-h-[75dvh] max-w-md flex-col items-center justify-center px-4 text-center">
    <div
      v-if="status === 'rejected'"
      class="w-full space-y-4 rounded-2xl border border-rose-500/40 bg-zinc-900 p-6 shadow-xl"
    >
      <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
        <span class="text-xl font-bold" aria-hidden="true">✕</span>
      </div>
      <h1 class="text-lg font-bold text-rose-300">
        {{ t('bouncerRejectedTitle') }}
      </h1>
      <p class="text-sm text-zinc-400">
        {{ t('bouncerRejectedDesc') }}
      </p>
      <button
        type="button"
        class="w-full rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
        @click="emit('backHome')"
      >
        {{ t('backHomeBtn') }}
      </button>
    </div>

    <div
      v-else
      class="w-full space-y-5 rounded-2xl border border-emerald-500/30 bg-zinc-900 p-6 shadow-xl"
    >
      <div class="relative mx-auto flex h-14 w-14 items-center justify-center">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30" />
        <span class="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
          ♠
        </span>
      </div>
      <div class="space-y-1.5">
        <p class="font-mono text-xs uppercase tracking-widest text-emerald-400">
          #{{ roomId }}
        </p>
        <h1 class="text-lg font-bold text-zinc-100">
          {{ t('bouncerWaitingTitle') }}
        </h1>
        <p class="text-sm leading-relaxed text-zinc-400">
          {{ t('bouncerWaitingDesc') }}
        </p>
      </div>
      <button
        type="button"
        class="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
        @click="emit('backHome')"
      >
        {{ t('backHomeBtn') }}
      </button>
    </div>
  </section>
</template>
