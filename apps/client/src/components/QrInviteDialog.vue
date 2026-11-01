<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { fetchNetworkInfo } from '../api/http.js';
import { useI18n } from '../i18n/index.js';
import { closeModalDialog, openModalDialog } from '../utils/dom-enhancements.js';
import {
  generateInviteUrls,
  renderQrSvg,
  resolveCandidateOrigins,
} from '../utils/qr.js';

const props = defineProps<{
  roomId: string;
  inviteToken: string;
  displayToken: string;
}>();

const { t } = useI18n();
const dialogEl = ref<HTMLDialogElement | null>(null);
const activeTab = ref<'player' | 'tv'>('player');
const candidateOrigins = ref<string[]>([
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
]);
const selectedOrigin = ref<string>(candidateOrigins.value[0] ?? 'http://localhost:3000');
const qrSvgMarkup = ref<string>('');
const copied = ref(false);

const links = computed(() =>
  generateInviteUrls(
    selectedOrigin.value,
    props.roomId,
    props.inviteToken,
    props.displayToken,
  ),
);

const activeTargetUrl = computed(() =>
  activeTab.value === 'player'
    ? links.value.playerJoinUrl
    : links.value.tvDisplayUrl,
);

async function refreshQr(): Promise<void> {
  if (!activeTargetUrl.value) {
    return;
  }
  qrSvgMarkup.value = await renderQrSvg(activeTargetUrl.value);
}

async function loadNetworkOrigins(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const info = await fetchNetworkInfo();
    const resolved = resolveCandidateOrigins(
      window.location.origin,
      window.location.protocol,
      window.location.hostname,
      window.location.port,
      info.lanAddresses,
    );
    candidateOrigins.value = resolved;
    if (resolved[0]) {
      selectedOrigin.value = resolved[0];
    }
  } catch (_err) {
    // Keep window.location.origin fallback
  }
}

async function copyActiveLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(activeTargetUrl.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1800);
  } catch (_err) {
    copied.value = false;
  }
}

function open(): void {
  openModalDialog(dialogEl.value);
  void refreshQr();
}

function close(): void {
  closeModalDialog(dialogEl.value);
}

watch(activeTargetUrl, () => {
  copied.value = false;
  void refreshQr();
});

onMounted(() => {
  void loadNetworkOrigins();
  void refreshQr();
});

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialogEl"
    closedby="any"
    aria-labelledby="qr-dialog-title"
    class="m-auto w-[min(92vw,26rem)] rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 id="qr-dialog-title" class="text-lg font-semibold tracking-tight">
          {{ t('qrDialogTitle') }}
        </h2>
        <form method="dialog">
          <button
            type="submit"
            autofocus
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            {{ t('closeBtn') }}
          </button>
        </form>
      </div>

      <div class="grid grid-cols-2 gap-1.5 rounded-xl bg-zinc-950 p-1">
        <button
          type="button"
          class="rounded-lg py-2 text-xs font-semibold transition"
          :class="
            activeTab === 'player'
              ? 'bg-emerald-500 text-zinc-950'
              : 'text-zinc-400 hover:text-zinc-200'
          "
          @click="activeTab = 'player'"
        >
          {{ t('qrPlayerTab') }}
        </button>
        <button
          type="button"
          class="rounded-lg py-2 text-xs font-semibold transition"
          :class="
            activeTab === 'tv'
              ? 'bg-amber-500 text-zinc-950'
              : 'text-zinc-400 hover:text-zinc-200'
          "
          @click="activeTab = 'tv'"
        >
          {{ t('qrTvTab') }}
        </button>
      </div>

      <div v-if="candidateOrigins.length > 1" class="space-y-1">
        <label for="qr-origin-select" class="block text-xs text-zinc-400">
          {{ t('qrHostAddressLabel') }}
        </label>
        <select
          id="qr-origin-select"
          v-model="selectedOrigin"
          class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
        >
          <option v-for="orig in candidateOrigins" :key="orig" :value="orig">
            {{ orig }}
          </option>
        </select>
      </div>

      <div
        class="mx-auto flex aspect-square w-56 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
        v-html="qrSvgMarkup"
      />

      <p class="break-all rounded-xl bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-400">
        {{ activeTargetUrl }}
      </p>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
          @click="copyActiveLink"
        >
          {{ copied ? t('qrCopiedBtn') : t('qrCopyLinkBtn') }}
        </button>
        <a
          v-if="activeTab === 'tv'"
          :href="links.tvDisplayUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
        >
          {{ t('qrOpenTvBtn') }}
        </a>
      </div>
    </div>
  </dialog>
</template>
