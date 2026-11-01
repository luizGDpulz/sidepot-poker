<script setup lang="ts">
import {
  DEEPSTACK_BLIND_SCHEDULE,
  STANDARD_BLIND_SCHEDULE,
  TURBO_BLIND_SCHEDULE,
  type BlindLevel,
  type GameMode,
} from '@sidepot/core';
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiHttpError, apiCreateRoom, apiJoinRoomLobby } from '../api/http.js';
import AppFooterBar from '../components/AppFooterBar.vue';
import LanguageFlagPicker from '../components/LanguageFlagPicker.vue';
import { useI18n } from '../i18n/index.js';
import { saveRoomCredentials } from '../stores/credentials.js';
import { formatChips } from '../utils/format.js';

type BlindPresetId = 'turbo' | 'standard' | 'deepstack';

const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();

const activeTab = ref<'create' | 'join'>('create');
const busy = ref(false);
const errorBanner = ref<string | null>(null);

// Create Table Wizard State
const tableName = ref('Friday Night Hold’em');
const hostPlayerName = ref('');
const gameMode = ref<GameMode>('TOURNAMENT');
const startingStack = ref<number>(10000);
const maxSeats = ref<number>(9);
const blindPreset = ref<BlindPresetId>('standard');
const fixedSmallBlind = ref<number>(25);
const fixedBigBlind = ref<number>(50);
const fixedAnte = ref<number>(0);
const actionTimeSeconds = ref<number | null>(null);
const allowRebuys = ref(true);
const allowAddOn = ref(true);

// Join Table Form State
const joinRoomId = ref('');
const joinInviteToken = ref('');
const joinPlayerName = ref('');

const STACK_OPTIONS = [1000, 5000, 10000, 20000] as const;
const SEAT_OPTIONS = [6, 8, 9, 10] as const;
const SHOT_CLOCK_OPTIONS = [null, 15, 30, 45, 60] as const;

function resolveSchedule(preset: BlindPresetId): readonly BlindLevel[] {
  if (gameMode.value === 'CASH') {
    const sb = Math.max(1, Math.trunc(fixedSmallBlind.value || 25));
    const bb = Math.max(sb, Math.trunc(fixedBigBlind.value || sb * 2));
    const ante = Math.max(0, Math.trunc(fixedAnte.value || 0));
    return [
      {
        level: 1,
        smallBlind: sb,
        bigBlind: bb,
        ante,
        durationSeconds: 3600,
      },
    ];
  }
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
        gameMode: gameMode.value,
        actionTimeSeconds: actionTimeSeconds.value,
        maxSeats: maxSeats.value,
        startingStack: startingStack.value,
        blindSchedule: resolveSchedule(blindPreset.value),
        allowRebuys: gameMode.value === 'CASH' ? true : allowRebuys.value,
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
  <div class="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
    <main class="flex-1 px-4 py-6 sm:py-8">
      <div class="mx-auto max-w-lg space-y-5">
        <header class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-lg font-bold text-emerald-400"
            >
              ♠
            </div>
            <div>
              <h1 class="text-xl font-bold tracking-tight text-zinc-100">
                Sidepot
              </h1>
              <p class="text-xs text-zinc-400">{{ t('appTagline') }}</p>
            </div>
          </div>
          <LanguageFlagPicker />
        </header>

        <div
          class="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5"
        >
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

        <!-- CREATE TABLE WIZARD -->
        <form
          v-if="activeTab === 'create'"
          class="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-xl"
          @submit.prevent="handleCreateSubmit"
        >
          <!-- Game Mode Selector (Tournament vs Fixed Blinds Cash Game) -->
          <div class="space-y-1.5">
            <span
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
              {{ t('gameModeLabel') }}
            </span>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-xl border px-3 py-2.5 text-xs font-bold transition"
                :class="
                  gameMode === 'TOURNAMENT'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                "
                @click="gameMode = 'TOURNAMENT'"
              >
                🏆 {{ t('modeTournament') }}
              </button>
              <button
                type="button"
                class="rounded-xl border px-3 py-2.5 text-xs font-bold transition"
                :class="
                  gameMode === 'CASH'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                "
                @click="gameMode = 'CASH'"
              >
                🪙 {{ t('modeCash') }}
              </button>
            </div>
          </div>

          <div class="field-group">
            <label
              for="table-name"
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
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
              class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <div class="error-msg">
              <span aria-hidden="true">⚠</span>
              <span>{{ t('tableNameError') }}</span>
            </div>
          </div>

          <div class="field-group">
            <label
              for="host-name"
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
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
              class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <div class="error-msg">
              <span aria-hidden="true">⚠</span>
              <span>{{ t('hostNameError') }}</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <span
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
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

          <!-- Fixed Blinds Config (Cash Mode) -->
          <div
            v-if="gameMode === 'CASH'"
            class="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
          >
            <div>
              <label
                for="fixed-sb"
                class="block text-[10px] font-bold uppercase text-zinc-400"
              >
                {{ t('fixedSmallBlindLabel') }}
              </label>
              <input
                id="fixed-sb"
                v-model.number="fixedSmallBlind"
                type="number"
                min="1"
                step="1"
                required
                class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label
                for="fixed-bb"
                class="block text-[10px] font-bold uppercase text-zinc-400"
              >
                {{ t('fixedBigBlindLabel') }}
              </label>
              <input
                id="fixed-bb"
                v-model.number="fixedBigBlind"
                type="number"
                :min="fixedSmallBlind"
                step="1"
                required
                class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label
                for="fixed-ante"
                class="block text-[10px] font-bold uppercase text-zinc-400"
              >
                {{ t('fixedAnteLabel') }}
              </label>
              <input
                id="fixed-ante"
                v-model.number="fixedAnte"
                type="number"
                min="0"
                step="1"
                required
                class="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-white"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <!-- Tournament Blind Preset -->
            <div v-if="gameMode === 'TOURNAMENT'" class="space-y-1.5">
              <span
                class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
              >
                {{ t('blindPresetLabel') }}
              </span>
              <div class="space-y-1.5">
                <button
                  v-for="preset in ['turbo', 'standard', 'deepstack'] as const"
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

            <div class="space-y-3" :class="gameMode === 'CASH' ? 'sm:col-span-2' : ''">
              <div class="space-y-1.5">
                <span
                  class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                >
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

              <label
                v-if="gameMode === 'TOURNAMENT'"
                class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer pt-1"
              >
                <input
                  v-model="allowRebuys"
                  type="checkbox"
                  class="h-4 w-4 rounded"
                />
                <span>{{ t('allowRebuysLabel') }}</span>
              </label>

              <label
                class="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer"
              >
                <input
                  v-model="allowAddOn"
                  type="checkbox"
                  class="h-4 w-4 rounded"
                />
                <span>{{ t('allowAddOnLabel') }}</span>
              </label>
            </div>
          </div>

          <!-- Per-Turn Shot Clock Selector -->
          <div class="space-y-1.5">
            <span
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
              ⏱ {{ t('shotClockLabel') }}
            </span>
            <div class="grid grid-cols-5 gap-1.5">
              <button
                v-for="sec in SHOT_CLOCK_OPTIONS"
                :key="String(sec)"
                type="button"
                class="rounded-xl border py-1.5 text-xs font-semibold transition"
                :class="
                  actionTimeSeconds === sec
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                "
                @click="actionTimeSeconds = sec"
              >
                {{ sec === null ? t('shotClockOff') : `${sec}s` }}
              </button>
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
            <label
              for="join-player-name"
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
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
            <label
              for="join-room-id"
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
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
            <label
              for="join-invite-token"
              class="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
            >
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

    <AppFooterBar />
  </div>
</template>
