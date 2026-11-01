<script setup lang="ts">
import type { Player } from '@sidepot/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BouncerWaitingCard from '../components/BouncerWaitingCard.vue';
import HostControlDialog from '../components/HostControlDialog.vue';
import LeaderboardDialog from '../components/LeaderboardDialog.vue';
import PlayerTableHud from '../components/PlayerTableHud.vue';
import QrInviteDialog from '../components/QrInviteDialog.vue';
import ShowdownSelectorCard from '../components/ShowdownSelectorCard.vue';
import { useI18n } from '../i18n/index.js';
import { loadRoomCredentials } from '../stores/credentials.js';
import { useRoomSession } from '../stores/room-store.js';

const props = defineProps<{
  roomId: string;
}>();

const route = useRoute();
const router = useRouter();
const { t, toggleLocale } = useI18n();
const session = useRoomSession();

const qrDialogRef = ref<InstanceType<typeof QrInviteDialog> | null>(null);
const hostDialogRef = ref<InstanceType<typeof HostControlDialog> | null>(null);
const leaderboardDialogRef = ref<InstanceType<typeof LeaderboardDialog> | null>(
  null,
);
const autoOpenedQr = ref(false);

const pendingBouncerCount = computed<number>(
  () => session.adminOverlay.value?.pendingJoinRequests.length ?? 0,
);

const liveReadyPlayersCount = computed<number>(() => {
  const snap = session.snapshot.value;
  if (!snap) {
    return 0;
  }
  return snap.table.seats.filter(
    (p): p is Player =>
      p !== null &&
      p.stack > 0 &&
      p.status !== 'ELIMINATED' &&
      p.status !== 'SITTING_OUT',
  ).length;
});

onMounted(() => {
  const queryToken =
    typeof route.query['token'] === 'string' ? route.query['token'] : null;
  const saved = loadRoomCredentials(props.roomId);
  const tokenToUse = queryToken ?? saved?.token ?? null;

  if (!tokenToUse) {
    void router.replace({
      path: '/join',
      query: { room: props.roomId },
    });
    return;
  }

  session.connect(props.roomId, tokenToUse);
});

watch(
  () => session.adminOverlay.value,
  (overlay) => {
    if (
      overlay &&
      !autoOpenedQr.value &&
      route.query['qr'] === '1'
    ) {
      autoOpenedQr.value = true;
      setTimeout(() => {
        qrDialogRef.value?.open();
      }, 60);
    }
  },
);

onBeforeUnmount(() => {
  session.disconnect();
});

function navigateHome(): void {
  session.disconnect();
  void router.push('/');
}
</script>

<template>
  <main class="min-h-dvh bg-zinc-950 text-zinc-100">
    <!-- Top Room Navigation Bar -->
    <header class="sticky top-0 z-10 border-b border-zinc-800/90 bg-zinc-950/90 px-4 py-3 backdrop-blur">
      <div class="mx-auto flex max-w-2xl items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="truncate text-sm font-bold text-zinc-100 sm:text-base">
              {{ session.snapshot.value?.table.name ?? `#${roomId}` }}
            </h1>
            <span
              v-if="session.snapshot.value?.isLocked"
              class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
            >
              LOCK
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-[11px]">
            <span
              class="h-2 w-2 rounded-full"
              :class="
                session.connectionStatus.value === 'connected'
                  ? 'bg-emerald-400'
                  : session.connectionStatus.value === 'reconnecting' ||
                      session.connectionStatus.value === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-500'
              "
            />
            <span class="text-zinc-400">
              {{
                session.connectionStatus.value === 'connected'
                  ? t('statusConnected')
                  : session.connectionStatus.value === 'disconnected'
                    ? t('statusOffline')
                    : t('statusReconnecting')
              }}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button
            v-if="session.snapshot.value"
            type="button"
            class="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-700"
            @click="leaderboardDialogRef?.open()"
          >
            ★
          </button>

          <button
            v-if="session.role.value === 'HOST' && session.adminOverlay.value"
            type="button"
            class="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-emerald-400 hover:border-zinc-700"
            @click="qrDialogRef?.open()"
          >
            QR
          </button>

          <button
            v-if="session.role.value === 'HOST' && session.snapshot.value"
            type="button"
            class="relative rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-100 hover:bg-zinc-700"
            @click="hostDialogRef?.open()"
          >
            Host
            <span
              v-if="pendingBouncerCount > 0"
              class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-extrabold text-zinc-950"
            >
              {{ pendingBouncerCount }}
            </span>
          </button>

          <button
            type="button"
            class="rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-100"
            @click="toggleLocale"
          >
            {{ t('langToggleLabel') }}
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-2xl px-4 py-4 space-y-4">
      <!-- Dismissible Error Banner -->
      <div
        v-if="session.lastError.value"
        role="alert"
        class="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300"
      >
        <span>{{ session.lastError.value.message }}</span>
        <button
          type="button"
          class="font-bold text-rose-200"
          @click="session.clearError()"
        >
          ✕
        </button>
      </div>

      <!-- Bouncer Waiting / Rejected State -->
      <BouncerWaitingCard
        v-if="
          session.role.value === 'APPLICANT' ||
          session.bouncerStatus.value === 'waiting' ||
          session.bouncerStatus.value === 'rejected'
        "
        :status="session.bouncerStatus.value"
        :room-id="roomId"
        @back-home="navigateHome"
      />

      <!-- Active Room Table -->
      <template v-else-if="session.snapshot.value">
        <!-- Quick Host Deal Next Hand Banner when IDLE -->
        <div
          v-if="
            session.role.value === 'HOST' &&
            session.snapshot.value.table.street === 'IDLE' &&
            liveReadyPlayersCount >= 2 &&
            !session.snapshot.value.table.championPlayerId
          "
          class="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3"
        >
          <span class="text-xs font-semibold text-emerald-200">
            {{ formatStreetIdleReady(liveReadyPlayersCount) }}
          </span>
          <button
            type="button"
            class="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-zinc-950 shadow hover:bg-emerald-400"
            @click="session.startNextHand()"
          >
            {{ t('startHandBtn') }}
          </button>
        </div>

        <!-- Host Pot-by-Pot Showdown Selector -->
        <ShowdownSelectorCard
          v-if="
            session.role.value === 'HOST' &&
            session.snapshot.value.table.street === 'SHOWDOWN'
          "
          :pots="session.snapshot.value.table.pots"
          :seats="session.snapshot.value.table.seats"
          @resolve="(winners) => session.resolveShowdown(winners)"
        />

        <!-- One-Handed Player & Table HUD -->
        <PlayerTableHud
          :snapshot="session.snapshot.value"
          :role="session.role.value"
          :my-player="session.myPlayer.value"
          :is-my-turn="session.isMyTurn.value"
          :remaining-seconds="session.displayRemainingSeconds.value"
          @game-action="(act, amt) => session.sendGameAction(act, amt)"
          @seat-self="(name) => session.seatSelf(name)"
        />
      </template>
    </div>

    <!-- Native Modal Dialogs -->
    <QrInviteDialog
      v-if="session.role.value === 'HOST' && session.adminOverlay.value"
      ref="qrDialogRef"
      :room-id="roomId"
      :invite-token="session.adminOverlay.value.inviteToken"
      :display-token="session.adminOverlay.value.displayToken"
    />

    <HostControlDialog
      v-if="session.role.value === 'HOST' && session.snapshot.value"
      ref="hostDialogRef"
      :snapshot="session.snapshot.value"
      :admin-overlay="session.adminOverlay.value"
      @approve-join="(reqId) => session.approveJoin(reqId)"
      @reject-join="(reqId) => session.rejectJoin(reqId)"
      @set-locked="(locked) => session.setRoomLocked(locked)"
      @start-hand="session.startNextHand()"
      @undo="session.undoLastAction()"
      @toggle-clock="(run) => session.toggleClock(run)"
      @advance-level="session.advanceBlindLevel()"
      @rebuy="(pid) => session.rebuyPlayer(pid)"
      @addon="(pid) => session.addonPlayer(pid)"
      @adjust-stack="(pid, stk) => session.adjustPlayerStack(pid, stk)"
      @kick-player="(pid) => session.kickPlayer(pid)"
    />

    <LeaderboardDialog
      v-if="session.snapshot.value"
      ref="leaderboardDialogRef"
      :entries="session.snapshot.value.leaderboard"
    />
  </main>
</template>

<script lang="ts">
function formatStreetIdleReady(count: number): string {
  return `${String(count)} players ready`;
}
</script>
