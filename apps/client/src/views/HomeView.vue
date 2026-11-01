<script setup lang="ts">
import {
  DEEPSTACK_BLIND_SCHEDULE,
  STANDARD_BLIND_SCHEDULE,
  TURBO_BLIND_SCHEDULE,
  type BlindLevel,
} from '@sidepot/core';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiHttpError, apiCreateRoom, apiJoinRoomLobby } from '../api/http.js';
import { useI18n } from '../i18n/index.js';
import { saveRoomCredentials } from '../stores/credentials.js';
import { formatChips } from '../utils/format.js';

type BlindPresetId = 'turbo' | 'standard' | 'deepstack';

const route = useRoute();
const router = useRouter();
const { locale, t, toggleLocale } = useI18n();

const activeTab = ref<'create' | 'join'>('create');
const busy = ref(false);
const errorBanner = ref<string | null>(null);

// Create Table Wizard State
const tableName = ref('Friday Night Hold’em');
const hostPlayerName = ref('');
const startingStack = ref<number>(10000);
const maxSeats = ref<number>(9);
const blindPreset = ref<BlindPresetId>('standard');
const allowRebuys = ref(true);
const allowAddOn = ref(true);

// Join Table Form State
const joinRoomId = ref('');
const joinInviteToken = ref('');
const joinPlayerName = ref('');

const STACK_OPTIONS = [5000, 10000, 20000, 50000] as const;
const SEAT_OPTIONS = [6, 8, 9, 10] as const;

function resolveSchedule(preset: BlindPresetId): readonly BlindLevel[] {
  switch (preset) {
    case 'turbo':
      return TURBO_BLIND_SCHEDULE;
    case 'deepstack':
      return DEEPSTACK_BLIND_SCHEDULE;
    default:
      return STANDARD_BLIND_SCHEDULE;
  }
}

onMounted(() => {
  const qRoom = typeof route.query['room'] === 'string' ? route.query['room'] : '';
  const qInvite =
    typeof route.query['invite'] === 'string' ? route.query['invite'] : '';
  if (route.path === '/join' || qRoom || qInvite) {
    activeTab.value = 'join';
    if (qRoom) {
      joinRoomId.value = qRoom;
    }
    if (qInvite) {
      joinInviteToken.value = qInvite;
    }
  }
});

async function handleCreateSubmit(): Promise<void> {
  errorBanner.value = null;
  busy.value = true;
  try {
    const trimmedHost = hostPlayerName.value.trim();
    const created = await apiCreateRoom({
      tableName: tableName.value.trim(),
      ...(trimmedHost ? { hostPlayerName: trimmedHost } : {}),
      config: {
        maxSeats: maxSeats.value,
        startingStack: startingStack.value,
        blindSchedule: resolveSchedule(blindPreset.value),
        allowRebuys: allowRebuys.value,
        rebuyStack: startingStack.value,
        allowAddOn: allowAddOn.value,
        addOnStack: startingStack.value,
      },
    });

    saveRoomCredentials({
      roomId: created.roomId,
      token: created.adminToken,
      role: 'HOST',
      playerId: created.hostPlayerId,
      inviteToken: created.inviteToken,
      displayToken: created.displayToken,
      updatedAtMs: Date.now(),
    });

    await router.push({
      name: 'room',
      params: { roomId: created.roomId },
      query: { qr: '1' },
    });
  } catch (err) {
    errorBanner.value =
      err instanceof ApiHttpError ? err.message : 'Failed to create room';
  } finally {
    busy.value = false;
  }
}

async function handleJoinSubmit(): Promise<void> {
  errorBanner.value = null;
  busy.value = true;
  try {
    const targetRoomId = joinRoomId.value.trim();
    const joined = await apiJoinRoomLobby(targetRoomId, {
      inviteToken: joinInviteToken.value.trim(),
      name: joinPlayerName.value.trim(),
    });

    saveRoomCredentials({
      roomId: joined.roomId,
      token: joined.applicantToken,
      role: 'APPLICANT',
      playerId: null,
      requestId: joined.requestId,
      updatedAtMs: Date.now(),
    });

    await router.push({
      name: 'room',
      params: { roomId: joined.roomId },
    });
  } catch (err) {
    errorBanner.value =
      err instanceof ApiHttpError ? err.message : 'Failed to join table lobby';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="min-h-dvh bg-zinc-950 px-4 py-6 text-zinc-100 sm:py-10">
    <div class="mx-auto max-w-lg space-y-6">
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-lg font-bold text-emerald-400">
            ♠
          </div>
          <div>
            <h1 class="text-xl font-bold tracking-tight text-zinc-100">Sidepot</h1>
            <p class="text-xs text-zinc-400">{{ t('appTagline') }}</p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
          @click="toggleLocale"
        >
          {{ t('langToggleLabel') }}
        </button>
      </header>

      <div class="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5">
        <button
          type="button"
          class="rounded-xl py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === 'create'
              ? 'bg-emerald-500 text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          "
          @click="
            activeTab = 'create';
            errorBanner = null;
          "
        >
          {{ t('createTableTab') }}
        </button>
        <button
          type="button"
          class="rounded-xl py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === 'join'
              ? 'bg-emerald-500 text-zinc-950 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          "
          @click="
            activeTab = 'join';
            errorBanner = null;
          "
        >
          {{ t('joinTableTab') }}
        </button>
      </div>

      <div
        v-if="errorBanner"
        role="alert"
        class="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300"
      >
        {{ errorBanner }}
      </div>

      <!-- CREATE TOURNAMENT WIZARD -->
      <form
        v-if="activeTab === 'create'"
        class="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl"
        @submit.prevent="handleCreateSubmit"
      >
        <div class="field-group">
          <label for="table-name" class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {{ t('tableNameLabel') }}
          </label>
          <span id="table-name-hint" class="field-hint">
            {{ t('tableNameHint') }}
          </span>
          <input
            id="table-name"
            v-model="tableName"
            type="text"
            required
            minlength="2"
            maxlength="40"
            autocomplete="off"
            aria-describedby="table-name-hint"
            class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <div class="error-msg">
            <span aria-hidden="true">⚠</span>
            <span>{{ t('tableNameError') }}</span>
          </div>
        </div>

        <div class="field-group">
          <label for="host-name" class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {{ t('hostNameLabel') }}
          </label>
          <span id="host-name-hint" class="field-hint">
            {{ t('hostNameHint') }}
          </span>
          <input
            id="host-name"
            v-model="hostPlayerName"
            type="text"
            maxlength="24"
            autocomplete="nickname"
            aria-describedby="host-name-hint"
            class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <div class="error-msg">
            <span aria-hidden="true">⚠</span>
            <span>{{ t('hostNameError') }}</span>
          </div>
        </div>

        <div class="space-y-2">
          <span class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {{ t('startingStackLabel') }}
          </span>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="stk in STACK_OPTIONS"
              :key="stk"
              type="button"
              class="tabular-chips rounded-xl border py-2 text-xs font-semibold transition"
              :class="
                startingStack === stk
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              "
              @click="startingStack = stk"
            >
              {{ formatChips(stk, locale) }}
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <span class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              {{ t('blindPresetLabel') }}
            </span>
            <div class="space-y-1.5">
              <button
                v-for="preset in (['turbo', 'standard', 'deepstack'] as const)"
                :key="preset"
                type="button"
                class="w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold transition"
                :class="
                  blindPreset === preset
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                "
                @click="blindPreset = preset"
              >
                {{
                  preset === 'turbo'
                    ? t('presetTurbo')
                    : preset === 'deepstack'
                      ? t('presetDeepstack')
                      : t('presetStandard')
                }}
              </button>
            </div>
          </div>

          <div class="space-y-3">
            <div class="space-y-2">
              <span class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                {{ t('maxSeatsLabel') }}
              </span>
              <div class="grid grid-cols-4 gap-1.5">
                <button
                  v-for="seats in SEAT_OPTIONS"
                  :key="seats"
                  type="button"
                  class="tabular-chips rounded-xl border py-2 text-xs font-semibold transition"
                  :class="
                    maxSeats === seats
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                  "
                  @click="maxSeats = seats"
                >
                  {{ seats }}
                </button>
              </div>
            </div>

            <label class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer pt-1">
              <input v-model="allowRebuys" type="checkbox" class="h-4 w-4 rounded" />
              <span>{{ t('allowRebuysLabel') }}</span>
            </label>

            <label class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input v-model="allowAddOn" type="checkbox" class="h-4 w-4 rounded" />
              <span>{{ t('allowAddOnLabel') }}</span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          :disabled="busy"
          class="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {{ busy ? t('creatingBtn') : t('createTournamentBtn') }}
        </button>
      </form>

      <!-- JOIN TABLE LOBBY -->
      <form
        v-else
        class="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl"
        @submit.prevent="handleJoinSubmit"
      >
        <div class="field-group">
          <label for="join-player-name" class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {{ t('playerNameLabel') }}
          </label>
          <span id="join-player-hint" class="field-hint">
            {{ t('playerNameHint') }}
          </span>
          <input
            id="join-player-name"
            v-model="joinPlayerName"
            type="text"
            required
            minlength="2"
            maxlength="24"
            autocomplete="nickname"
            aria-describedby="join-player-hint"
            class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <div class="error-msg">
            <span aria-hidden="true">⚠</span>
            <span>{{ t('playerNameError') }}</span>
          </div>
        </div>

        <div class="field-group">
          <label for="join-room-id" class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {{ t('roomIdLabel') }}
          </label>
          <span id="join-room-hint" class="field-hint">
            {{ t('roomIdHint') }}
          </span>
          <input
            id="join-room-id"
            v-model="joinRoomId"
            type="text"
            required
            minlength="3"
            autocomplete="off"
            aria-describedby="join-room-hint"
            class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <div class="error-msg">
            <span aria-hidden="true">⚠</span>
            <span>{{ t('roomIdError') }}</span>
          </div>
        </div>

        <div class="field-group">
          <label for="join-invite-token" class="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {{ t('inviteTokenLabel') }}
          </label>
          <span id="join-invite-hint" class="field-hint">
            {{ t('inviteTokenHint') }}
          </span>
          <input
            id="join-invite-token"
            v-model="joinInviteToken"
            type="text"
            required
            minlength="6"
            autocomplete="off"
            aria-describedby="join-invite-hint"
            class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 font-mono text-xs text-zinc-300 outline-none focus:border-emerald-500"
          />
          <div class="error-msg">
            <span aria-hidden="true">⚠</span>
            <span>{{ t('inviteTokenError') }}</span>
          </div>
        </div>

        <button
          type="submit"
          :disabled="busy"
          class="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {{ busy ? t('joiningBtn') : t('requestSeatBtn') }}
        </button>
      </form>
    </div>
  </main>
</template>
