<script setup lang="ts">
import type {
  Chips,
  HostAdminOverlay,
  Player,
  PlayerId,
  PublicRoomSnapshot,
} from '@sidepot/core';
import { computed, ref } from 'vue';
import { useI18n } from '../i18n/index.js';
import { closeModalDialog, openModalDialog } from '../utils/dom-enhancements.js';
import { formatChips } from '../utils/format.js';

const props = defineProps<{
  snapshot: PublicRoomSnapshot;
  adminOverlay: HostAdminOverlay | null;
}>();

const emit = defineEmits<{
  approveJoin: [requestId: string];
  rejectJoin: [requestId: string];
  setLocked: [isLocked: boolean];
  startHand: [];
  undo: [];
  toggleClock: [running: boolean];
  advanceLevel: [];
  rebuy: [playerId: PlayerId];
  addon: [playerId: PlayerId];
  adjustStack: [playerId: PlayerId, newStack: Chips];
  kickPlayer: [playerId: PlayerId];
}>();

const { locale, t } = useI18n();
const dialogEl = ref<HTMLDialogElement | null>(null);
const editingPlayerId = ref<PlayerId | null>(null);
const editedStackValue = ref<number>(0);

const seatedPlayers = computed<Player[]>(() =>
  props.snapshot.table.seats.filter((s): s is Player => s !== null),
);

const isBetweenHands = computed<boolean>(
  () => props.snapshot.table.street === 'IDLE',
);

const liveReadyCount = computed<number>(
  () =>
    seatedPlayers.value.filter(
      (p) => p.stack > 0 && p.status !== 'ELIMINATED' && p.status !== 'SITTING_OUT',
    ).length,
);

function beginAdjust(player: Player): void {
  editingPlayerId.value = player.id;
  editedStackValue.value = player.stack;
}

function submitAdjust(playerId: PlayerId): void {
  if (Number.isSafeInteger(editedStackValue.value) && editedStackValue.value >= 0) {
    emit('adjustStack', playerId, editedStackValue.value);
    editingPlayerId.value = null;
  }
}

function open(): void {
  openModalDialog(dialogEl.value);
}

function close(): void {
  editingPlayerId.value = null;
  closeModalDialog(dialogEl.value);
}

defineExpose({ open, close });
</script>

<template>
  <dialog
    ref="dialogEl"
    closedby="any"
    aria-labelledby="host-panel-title"
    class="m-auto w-[min(95vw,30rem)] max-h-[88dvh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 shadow-2xl"
  >
    <div class="space-y-5">
      <div class="flex items-center justify-between">
        <h2 id="host-panel-title" class="text-base font-bold">
          {{ t('hostPanelTitle') }}
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

      <!-- Bouncer Queue & Lock Room -->
      <section class="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-300">
            {{ t('bouncerQueueTitle') }}
          </h3>
          <button
            type="button"
            class="rounded-lg border px-2.5 py-1 text-xs font-bold transition"
            :class="
              snapshot.isLocked
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300'
            "
            @click="emit('setLocked', !snapshot.isLocked)"
          >
            {{ snapshot.isLocked ? t('unlockRoomBtn') : t('lockRoomBtn') }}
          </button>
        </div>

        <p
          v-if="!adminOverlay || adminOverlay.pendingJoinRequests.length === 0"
          class="text-xs text-zinc-500"
        >
          {{ t('bouncerEmpty') }}
        </p>

        <ul v-else class="space-y-2">
          <li
            v-for="req in adminOverlay.pendingJoinRequests"
            :key="req.requestId"
            class="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2"
          >
            <span class="truncate text-sm font-semibold text-zinc-100">
              {{ req.name }}
            </span>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                class="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                @click="emit('approveJoin', req.requestId)"
              >
                {{ t('approveBtn') }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 text-xs font-bold text-rose-300"
                @click="emit('rejectJoin', req.requestId)"
              >
                {{ t('rejectBtn') }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Hand & Blind Clock Controls -->
      <section class="grid grid-cols-2 gap-2">
        <button
          type="button"
          :disabled="!isBetweenHands || liveReadyCount < 2"
          class="rounded-xl bg-emerald-500 py-2.5 text-xs font-extrabold text-zinc-950 disabled:opacity-40"
          @click="
            emit('startHand');
            close();
          "
        >
          {{ t('startHandBtn') }}
        </button>

        <button
          type="button"
          :disabled="!snapshot.canUndo"
          class="rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-xs font-bold text-zinc-100 disabled:opacity-40"
          @click="emit('undo')"
        >
          {{ t('undoActionBtn') }}
        </button>

        <button
          type="button"
          class="rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-xs font-bold text-zinc-100"
          @click="emit('toggleClock', !snapshot.blindClock.isRunning)"
        >
          {{
            snapshot.blindClock.isRunning
              ? t('clockPauseBtn')
              : t('clockRunBtn')
          }}
        </button>

        <button
          type="button"
          class="rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-xs font-bold text-amber-300"
          @click="emit('advanceLevel')"
        >
          {{ t('clockNextLevelBtn') }}
        </button>
      </section>

      <!-- Player Chip Stack, Rebuy & Add-on Manager -->
      <section class="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
        <h3 class="text-xs font-bold uppercase tracking-wider text-zinc-300">
          {{ t('managePlayersTitle') }}
        </h3>

        <ul class="divide-y divide-zinc-800/80">
          <li
            v-for="p in seatedPlayers"
            :key="p.id"
            class="space-y-2 py-2.5 first:pt-0 last:pb-0"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-zinc-100">
                  {{ p.name }}
                </p>
                <p class="tabular-chips text-xs font-bold text-emerald-400">
                  {{ formatChips(p.stack, locale) }}
                </p>
              </div>

              <div v-if="isBetweenHands" class="flex flex-wrap items-center gap-1.5">
                <button
                  v-if="snapshot.table.config.allowRebuys && p.stack === 0"
                  type="button"
                  class="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300"
                  @click="emit('rebuy', p.id)"
                >
                  {{ t('rebuyBtn') }}
                </button>
                <button
                  v-if="
                    snapshot.table.config.allowAddOn &&
                    p.stack > 0 &&
                    p.addOnCount === 0
                  "
                  type="button"
                  class="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300"
                  @click="emit('addon', p.id)"
                >
                  {{ t('addonBtn') }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300"
                  @click="beginAdjust(p)"
                >
                  {{ t('adjustStackBtn') }}
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-300"
                  @click="emit('kickPlayer', p.id)"
                >
                  {{ t('kickBtn') }}
                </button>
              </div>
            </div>

            <form
              v-if="editingPlayerId === p.id && isBetweenHands"
              class="field-group space-y-1.5 pt-1"
              @submit.prevent="submitAdjust(p.id)"
            >
              <span :id="`stack-hint-${p.id}`" class="field-hint">
                {{ t('newStackHint') }}
              </span>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="editedStackValue"
                  type="number"
                  required
                  min="0"
                  step="1"
                  :aria-describedby="`stack-hint-${p.id}`"
                  class="tabular-chips flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100"
                />
                <button
                  type="submit"
                  class="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950"
                >
                  {{ t('confirmBtn') }}
                </button>
              </div>
              <div class="error-msg">
                <span aria-hidden="true">⚠</span>
                <span>{{ t('newStackError') }}</span>
              </div>
            </form>
          </li>
        </ul>
      </section>
    </div>
  </dialog>
</template>
