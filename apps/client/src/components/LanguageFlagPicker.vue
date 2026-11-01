<script setup lang="ts">
import { useI18n } from '../i18n/index.js';

const { locale, locales, setLocale } = useI18n();
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5 rounded-xl border border-slate-800 bg-slate-900/90 p-0.5"
    role="group"
    aria-label="Language selector"
  >
    <button
      v-for="item in locales"
      :key="item.code"
      type="button"
      :aria-pressed="locale === item.code"
      :aria-label="item.name"
      class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition"
      :class="
        locale === item.code
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
          : 'text-slate-400 hover:text-slate-200 border border-transparent'
      "
      @click="setLocale(item.code)"
    >
      <span aria-hidden="true" class="text-xs leading-none">{{ item.flag }}</span>
      <span>{{ item.shortLabel }}</span>
    </button>
  </div>
</template>
