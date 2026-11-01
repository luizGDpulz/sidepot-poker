<script setup lang="ts">
import { useI18n } from '../i18n/index.js';

const { t } = useI18n();
</script>

<template>
  <main class="min-h-dvh bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
    <div class="text-center space-y-2">
      <h1 class="text-2xl font-bold tracking-tight text-emerald-400">Sidepot</h1>
      <p class="text-sm text-zinc-400">{{ t('appTagline') }}</p>
    </div>
  </main>
</template>
