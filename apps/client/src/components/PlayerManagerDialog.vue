<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Player, PlayerId, PublicRoomSnapshot } from '@sidepot/core';
import { useI18n } from '../i18n/index.js';
import { formatChips } from '../utils/format.js';

const props = defineProps<{
  open: boolean;
  snapshot: PublicRoomSnapshot;
  focusedPlayerId?: PlayerId | null;
}>();

const emit = defineEmits<{
  close: [];
  skipTurn: [];
  setSittingOut: [playerId: PlayerId, sittingOut: boolean];
  adjustStack: [playerId: PlayerId, newStack: number];
  rebuy: [playerId: PlayerId];
  addon: [playerId: PlayerId];
  kick: [playerId: PlayerId];
}>();

const { locale, t } = useI18n();
const dialogRef = ref<HTMLDialogElement | null>(null);
const editingPlayerId = ref<PlayerId | null>(null);
const newStackValue = ref<number>(5000);

const seatedPlayers = computed<readonly Player[]>(() =>
  props.snapshot.table.seats.filter((s): s is Player => s !== null),
);

const isBetweenHands = computed(
  () =>
    props.snapshot.table.street === 'IDLE' ||
    props.snapshot.table.street === 'COMPLETE',
);

const actingPlayerId = computed<PlayerId | null>(() => {
  const idx = props.snapshot.table.actingSeatIndex;
  if (idx === null) return null;
  return props.snapshot.table.seats[idx]?.id ?? null;
});

watch(
  () => props.open,
  (isOpen) => {
    const el = dialogRef.value;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
    } else if (!isOpen && el.open) {
      el.close();
      editingPlayerId.value = null;
    }
  },
);

function startAdjust(player: Player): void {
  editingPlayerId.value = player.id;
  newStackValue.value = player.stack;
}

function submitAdjust(playerId: PlayerId): void {
  if (!Number.isFinite(newStackValue.value) || newStackValue.value < 0) return;
  emit('adjustStack', playerId, Math.trunc(newStackValue.value));
  editingPlayerId.value = null;
}
</script>

<template>
  <dialog
    ref="dialogRef"
    v-bind="{ closedby: 'any' } as Record<string, unknown>"
    class="m-auto w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 text-slate-100 shadow-2xl backdrop:bg-black/75"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-base font-bold text-white">
            👥 {{ t('managePlayersTitle') }}
          </h2>
          <p class="text-[11px] text-slate-400">
            {{ isBetweenHands ? t('newStackHint') : t('waitingForTurn') }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          @click="emit('close')"
        >
          {{ t('closeBtn') }}
        </button>
      </div>

      <ul class="max-h-[65dvh] space-y-2.5 overflow-y-auto pr-1">
        <li
          v-for="p in seatedPlayers"
          :key="p.id"
          class="rounded-xl border p-3 transition"
          :class="
            p.id === focusedPlayerId
              ? 'border-emerald-500/70 bg-emerald-950/20'
              : p.id === actingPlayerId
                ? 'border-amber-400/70 bg-amber-950/15'
                : 'border-slate-800 bg-slate-950/80'
          "
        >
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-xs font-bold text-slate-500">
                  #{{ p.seatIndex + 1 }}
                </span>
                <span class="text-sm font-bold text-white">{{ p.name }}</span>
                <span
                  v-if="p.id === actingPlayerId"
                  class="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-950"
                >
                  ⚡ {{ t('activeTurnBadge') }}
                </span>
                <span
                  v-else-if="p.status === 'SITTING_OUT'"
                  class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"
                >
                  {{ t('sittingOutBadge') }}
                </span>
                <span
                  v-else-if="p.status === 'ELIMINATED'"
                  class="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300"
                >
                  {{ t('eliminatedBadge') }}
                </span>
              </div>
              <p class="mt-0.5 font-mono text-xs font-bold tabular-nums text-emerald-400">
                {{ formatChips(p.stack, locale) }}
                <span
                  v-if="p.rebuyCount > 0 || p.addOnCount > 0"
                  class="ml-1.5 text-[10px] font-normal text-slate-400"
                >
                  (R:{{ p.rebuyCount }} / A:{{ p.addOnCount }})
                </span>
              </p>
            </div>

            <!-- Action Buttons Row -->
            <div class="flex flex-wrap items-center justify-end gap-1.5">
              <!-- Force Skip Turn if this player is currently acting -->
              <button
                v-if="p.id === actingPlayerId"
                type="button"
                class="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-slate-950 hover:bg-amber-300"
                @click="emit('skipTurn')"
              >
                ⏭ {{ t('skipTurnBtn') }}
              </button>

              <!-- Sit Out / Activate Toggle -->
              <button
                v-if="p.status !== 'ELIMINATED'"
                type="button"
                :disabled="
                  !isBetweenHands &&
                  p.id !== actingPlayerId &&
                  (p.status === 'ACTIVE' || p.status === 'ALL_IN')
                "
                class="rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40"
                :class="
                  p.status === 'SITTING_OUT'
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                "
                @click="emit('setSittingOut', p.id, p.status !== 'SITTING_OUT')"
              >
                {{ p.status === 'SITTING_OUT' ? t('sitInBtn') : t('sitOutBtn') }}
              </button>

              <!-- Rebuy (when stack === 0 between hands) -->
              <button
                v-if="isBetweenHands && p.stack === 0"
                type="button"
                class="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400"
                @click="emit('rebuy', p.id)"
              >
                {{ t('rebuyBtn') }}
              </button>

              <!-- Add-on (when stack > 0 between hands) -->
              <button
                v-if="
                  isBetweenHands &&
                  p.stack > 0 &&
                  snapshot.table.config.allowAddOn &&
                  p.addOnCount < 1
                "
                type="button"
                class="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                @click="emit('addon', p.id)"
              >
                {{ t('addonBtn') }}
              </button>

              <!-- Manual Stack Adjust (between hands) -->
              <button
                v-if="isBetweenHands"
                type="button"
                class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                @click="startAdjust(p)"
              >
                {{ t('adjustStackBtn') }}
              </button>

              <!-- Kick Player -->
              <button
                v-if="isBetweenHands || p.status === 'WAITING' || p.status === 'SITTING_OUT' || p.status === 'ELIMINATED'"
                type="button"
                class="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                @click="emit('kick', p.id)"
              >
                {{ t('kickBtn') }}
              </button>
            </div>
          </div>

          <!-- Inline Manual Stack Editor -->
          <form
            v-if="editingPlayerId === p.id && isBetweenHands"
            class="mt-2.5 flex items-center gap-2 border-t border-slate-800 pt-2.5"
            @submit.prevent="submitAdjust(p.id)"
          >
            <label :for="`adj-stack-${p.id}`" class="text-xs font-semibold text-slate-300">
              {{ t('newStackLabel') }}:
            </label>
            <input
              :id="`adj-stack-${p.id}`"
              v-model.number="newStackValue"
              type="number"
              min="0"
              step="25"
              required
              class="w-32 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-xs text-white"
            />
            <button
              type="submit"
              class="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-400"
            >
              {{ t('confirmBtn') }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400"
              @click="editingPlayerId = null"
            >
              {{ t('cancelBtn') }}
            </button>
          </form>
        </li>
      </ul>
    </div>
  </dialog>
</template>
