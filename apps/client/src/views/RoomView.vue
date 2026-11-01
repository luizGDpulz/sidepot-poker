<script setup lang="ts">
import type { Player, PlayerId } from '@sidepot/core';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppFooterBar from '../components/AppFooterBar.vue';
import BouncerWaitingCard from '../components/BouncerWaitingCard.vue';
import HandRankingsPanel from '../components/HandRankingsPanel.vue';
import HostControlDialog from '../components/HostControlDialog.vue';
import LanguageFlagPicker from '../components/LanguageFlagPicker.vue';
import LeaderboardDialog from '../components/LeaderboardDialog.vue';
import MiniTableRing from '../components/MiniTableRing.vue';
import PlayerManagerDialog from '../components/PlayerManagerDialog.vue';
import PlayerTableHud from '../components/PlayerTableHud.vue';
import QrInviteDialog from '../components/QrInviteDialog.vue';
import RaiseSheetDialog from '../components/RaiseSheetDialog.vue';
import ShowdownSelectorCard from '../components/ShowdownSelectorCard.vue';
import TableTimelinePanel from '../components/TableTimelinePanel.vue';
import { useI18n } from '../i18n/index.js';
import { loadRoomCredentials } from '../stores/credentials.js';
import { useRoomSession } from '../stores/room-store.js';
import { formatChips, formatClock } from '../utils/format.js';

const props = defineProps<{
  roomId: string;
}>();

const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();
const session = useRoomSession();

const qrDialogRef = ref<InstanceType<typeof QrInviteDialog> | null>(null);
const hostDialogRef = ref<InstanceType<typeof HostControlDialog> | null>(null);
const leaderboardDialogRef = ref<InstanceType<typeof LeaderboardDialog> | null>(
  null,
);
const raiseDialogRef = ref<InstanceType<typeof RaiseSheetDialog> | null>(null);
const handRankingsDialogEl = ref<HTMLDialogElement | null>(null);
const mobileTimelineDialogEl = ref<HTMLDialogElement | null>(null);

const playerManagerOpen = ref(false);
const focusedPlayerId = ref<PlayerId | null>(null);
const autoOpenedQr = ref(false);

const pendingBouncerCount = computed<number>(
  () => session.adminOverlay.value?.pendingJoinRequests.length ?? 0,
);

const isCashGame = computed<boolean>(
  () => session.snapshot.value?.table.config.gameMode === 'CASH',
);

const isTournamentOver = computed<boolean>(
  () =>
    !isCashGame.value &&
    session.snapshot.value?.table.championPlayerId !== null &&
    session.snapshot.value?.table.championPlayerId !== undefined,
);

const isBetweenHands = computed<boolean>(() => {
  const street = session.snapshot.value?.table.street;
  return (street === 'IDLE' || street === 'COMPLETE') && !isTournamentOver.value;
});

const currentBlindLevel = computed(() => {
  const snap = session.snapshot.value;
  if (!snap) {
    return { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationSeconds: 900 };
  }
  const sched = snap.table.config.blindSchedule;
  const idx = Math.min(sched.length - 1, Math.max(0, snap.table.blindLevelIndex));
  return (
    sched[idx] ?? {
      level: 1,
      smallBlind: 25,
      bigBlind: 50,
      ante: 0,
      durationSeconds: 900,
    }
  );
});

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

function cycleShotClock(): void {
  const current = session.snapshot.value?.table.config.actionTimeSeconds ?? null;
  const order: readonly (number | null)[] = [null, 15, 30, 45, 60];
  const idx = order.indexOf(current);
  const next = order[(idx + 1) % order.length] ?? null;
  session.setActionTimer(next);
}

function openPlayerManager(targetId: PlayerId | null = null): void {
  focusedPlayerId.value = targetId;
  playerManagerOpen.value = true;
}

function openHandRankingsModal(): void {
  const el = handRankingsDialogEl.value;
  if (el && !el.open) {
    el.showModal();
  }
}

function closeHandRankingsModal(): void {
  const el = handRankingsDialogEl.value;
  if (el && el.open) {
    el.close();
  }
}

function openMobileTimelineModal(): void {
  const el = mobileTimelineDialogEl.value;
  if (el && !el.open) {
    el.showModal();
  }
}

function closeMobileTimelineModal(): void {
  const el = mobileTimelineDialogEl.value;
  if (el && el.open) {
    el.close();
  }
}

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
    if (overlay && !autoOpenedQr.value && route.query['qr'] === '1') {
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
  <!-- Locked Viewport Shell (eliminates mobile action button scroll drift T4.2) -->
  <div class="h-dvh overflow-hidden flex flex-col bg-zinc-950 text-zinc-100">
    <!-- Clean 3-Column Header with Centered Tournament Timer -->
    <header
      class="shrink-0 border-b border-zinc-800/90 bg-zinc-950/95 px-3 py-2 backdrop-blur"
    >
      <div class="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2">
        <!-- Left: Table Name & Live Dot -->
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :title="session.connectionStatus.value"
            :class="
              session.connectionStatus.value === 'connected'
                ? 'bg-emerald-400'
                : session.connectionStatus.value === 'reconnecting' ||
                    session.connectionStatus.value === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
            "
          />
          <h1 class="truncate text-xs sm:text-sm font-bold text-zinc-100">
            {{ session.snapshot.value?.table.name ?? `#${roomId}` }}
          </h1>
          <span
            v-if="session.snapshot.value && session.snapshot.value.table.handNumber > 0"
            class="hidden sm:inline-block rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-400"
          >
            {{ t('handNumberLabel', { num: session.snapshot.value.table.handNumber }) }}
          </span>
        </div>

        <!-- Center: Tournament Blind Clock OR Fixed Blinds Badge -->
        <div v-if="session.snapshot.value" class="flex flex-col items-center text-center">
          <template v-if="!isCashGame">
            <div class="flex items-center gap-1.5">
              <span
                class="tabular-chips font-mono text-base sm:text-xl font-black leading-none tracking-tight"
                :class="
                  session.displayRemainingSeconds.value <= 60 &&
                  session.snapshot.value.blindClock.isRunning
                    ? 'text-amber-400 animate-pulse'
                    : 'text-white'
                "
              >
                {{ formatClock(session.displayRemainingSeconds.value) }}
              </span>
              <span
                class="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400 border border-zinc-800"
              >
                {{ t('blindLevelLabel', { level: currentBlindLevel.level }) }}
              </span>
            </div>
            <p class="tabular-chips text-[10px] font-semibold text-zinc-400 leading-tight">
              {{
                t('blindsDisplay', {
                  sb: formatChips(currentBlindLevel.smallBlind, locale),
                  bb: formatChips(currentBlindLevel.bigBlind, locale),
                })
              }}
              <template v-if="currentBlindLevel.ante > 0">
                • {{ t('anteDisplay', { ante: formatChips(currentBlindLevel.ante, locale) }) }}
              </template>
            </p>
          </template>

          <template v-else>
            <span
              class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300"
            >
              🪙 {{ t('fixedBlindsBadge') }}
            </span>
            <p class="tabular-chips mt-0.5 text-[11px] font-bold text-zinc-200 leading-tight">
              {{
                t('blindsDisplay', {
                  sb: formatChips(currentBlindLevel.smallBlind, locale),
                  bb: formatChips(currentBlindLevel.bigBlind, locale),
                })
              }}
              <template v-if="currentBlindLevel.ante > 0">
                • {{ t('anteDisplay', { ante: formatChips(currentBlindLevel.ante, locale) }) }}
              </template>
            </p>
          </template>
        </div>
        <div v-else />

        <!-- Right: Compact Utility & Flag Controls -->
        <div class="flex items-center justify-end gap-1 sm:gap-1.5">
          <button
            v-if="session.snapshot.value"
            type="button"
            :title="t('handRankingsBtn')"
            class="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-200 hover:border-zinc-700"
            @click="openHandRankingsModal"
          >
            🃏
          </button>

          <button
            v-if="session.snapshot.value"
            type="button"
            :title="t('leaderboardTitle')"
            class="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-semibold text-amber-300 hover:border-zinc-700"
            @click="leaderboardDialogRef?.open()"
          >
            ★
          </button>

          <button
            v-if="session.snapshot.value"
            type="button"
            :title="t('timelineTitle')"
            class="lg:hidden rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-300 hover:border-zinc-700"
            @click="openMobileTimelineModal"
          >
            📜
          </button>

          <LanguageFlagPicker />
        </div>
      </div>
    </header>

    <!-- Direct On-Screen Host Quick-Action Bar (Zero Modal Required for Frequent Actions) -->
    <div
      v-if="session.role.value === 'HOST' && session.snapshot.value"
      class="shrink-0 border-b border-zinc-800/80 bg-zinc-900/90 px-3 py-1.5"
    >
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-1.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <!-- Deal Next Hand (works on both IDLE and COMPLETE!) -->
          <button
            type="button"
            :disabled="!isBetweenHands || liveReadyPlayersCount < 2"
            class="rounded-lg px-3 py-1 text-xs font-extrabold transition disabled:opacity-35"
            :class="
              isBetweenHands && liveReadyPlayersCount >= 2
                ? 'bg-emerald-500 text-zinc-950 shadow shadow-emerald-500/20 hover:bg-emerald-400 animate-pulse'
                : 'border border-zinc-700 bg-zinc-800 text-zinc-300'
            "
            @click="session.startNextHand()"
          >
            ▶ {{ t('dealHandShortBtn') }}
          </button>

          <!-- Pause / Resume Clock (Tournament mode) -->
          <button
            v-if="!isCashGame"
            type="button"
            class="rounded-lg border px-2.5 py-1 text-xs font-bold transition"
            :class="
              session.snapshot.value.blindClock.isRunning
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            "
            @click="session.toggleClock(!session.snapshot.value.blindClock.isRunning)"
          >
            {{
              session.snapshot.value.blindClock.isRunning
                ? `⏸ ${t('clockPauseBtn')}`
                : `⏱ ${t('clockRunBtn')}`
            }}
          </button>

          <!-- Force Skip AFK Player Turn (when someone is acting) -->
          <button
            v-if="session.snapshot.value.table.actingSeatIndex !== null"
            type="button"
            class="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-zinc-950 hover:bg-amber-300"
            @click="session.forceSkipTurn()"
          >
            ⏭ {{ t('skipTurnBtn') }}
          </button>

          <!-- Undo Last Action -->
          <button
            type="button"
            :disabled="!session.snapshot.value.canUndo"
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-35"
            @click="session.undoLastAction()"
          >
            ↶ {{ t('undoShortBtn') }}
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <!-- Shot Clock Quick Cycler -->
          <button
            type="button"
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700"
            :title="t('shotClockLabel')"
            @click="cycleShotClock"
          >
            ⏱
            {{
              session.snapshot.value.table.config.actionTimeSeconds
                ? `${session.snapshot.value.table.config.actionTimeSeconds}s`
                : t('shotClockOff')
            }}
          </button>

          <!-- Dedicated Player Manager Modal Trigger -->
          <button
            type="button"
            class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
            @click="openPlayerManager(null)"
          >
            👥 {{ t('playersManagerBtn') }}
          </button>

          <!-- QR Code Modal Trigger -->
          <button
            v-if="session.adminOverlay.value"
            type="button"
            class="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-bold text-emerald-400 hover:bg-zinc-700"
            @click="qrDialogRef?.open()"
          >
            QR
          </button>

          <!-- Full Host Panel / Bouncer Trigger -->
          <button
            type="button"
            class="relative rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-bold text-zinc-100 hover:bg-zinc-700"
            @click="hostDialogRef?.open()"
          >
            ⚙
            <span
              v-if="pendingBouncerCount > 0"
              class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-extrabold text-zinc-950"
            >
              {{ pendingBouncerCount }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Split Workspace (Center Table + Right Live Timeline on Desktop) -->
    <div
      class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_20rem] overflow-hidden"
    >
      <!-- Left/Center Scrollable Table Area -->
      <main class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
        <div class="mx-auto max-w-3xl space-y-3">
          <!-- Dismissible Error Banner -->
          <div
            v-if="session.lastError.value"
            role="alert"
            class="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300"
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
            <!-- Instant Bouncer Approval Strip for Host when Requests arrive -->
            <div
              v-if="
                session.role.value === 'HOST' &&
                session.adminOverlay.value &&
                session.adminOverlay.value.pendingJoinRequests.length > 0
              "
              class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-1.5"
            >
              <p class="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                🔔 {{ t('bouncerQueueTitle') }} ({{
                  session.adminOverlay.value.pendingJoinRequests.length
                }})
              </p>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="req in session.adminOverlay.value.pendingJoinRequests"
                  :key="req.requestId"
                  class="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs"
                >
                  <span class="font-bold text-white">{{ req.name }}</span>
                  <button
                    type="button"
                    class="rounded bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-zinc-950 hover:bg-emerald-400"
                    @click="session.approveJoin(req.requestId)"
                  >
                    {{ t('approveBtn') }}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-rose-500/40 px-2 py-0.5 text-[11px] font-semibold text-rose-300"
                    @click="session.rejectJoin(req.requestId)"
                  >
                    {{ t('rejectBtn') }}
                  </button>
                </div>
              </div>
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

            <!-- Minified Interactive Oval Poker Table (Mobile + Desktop) -->
            <MiniTableRing
              :snapshot="session.snapshot.value"
              :my-player-id="session.playerId.value"
              :is-host="session.role.value === 'HOST'"
              :turn-remaining-seconds="session.turnRemainingSeconds.value"
              @select-player="(pid) => openPlayerManager(pid)"
            />

            <!-- Personal Player Stack Card & Unseated Host Seat Bar -->
            <PlayerTableHud
              :snapshot="session.snapshot.value"
              :role="session.role.value"
              :my-player="session.myPlayer.value"
              :is-my-turn="session.isMyTurn.value"
              :turn-remaining-seconds="session.turnRemainingSeconds.value"
              @seat-self="(name) => session.seatSelf(name)"
            />
          </template>
        </div>
      </main>

      <!-- Right-Side Live Table Action Log (Desktop Host/Player Panel) -->
      <div
        v-if="session.snapshot.value"
        class="hidden lg:flex flex-col border-l border-zinc-800/80 bg-zinc-900/50 overflow-hidden"
      >
        <TableTimelinePanel :entries="session.snapshot.value.actionLog" />
      </div>
    </div>

    <!-- Docked Bottom Player Action Bar (shrink-0 -> Never moves with scroll! T4.2 Fixed) -->
    <div
      v-if="
        session.snapshot.value &&
        session.isMyTurn.value &&
        session.snapshot.value.legalActions
      "
      class="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-4 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-8px_25px_rgba(0,0,0,0.6)]"
    >
      <div class="mx-auto grid max-w-lg grid-cols-3 gap-2.5">
        <button
          v-if="session.snapshot.value.legalActions.canFold"
          type="button"
          class="min-h-13 rounded-2xl border border-rose-500/40 bg-rose-500/15 text-sm font-extrabold text-rose-300 active:scale-[0.98]"
          @click="session.sendGameAction('FOLD')"
        >
          {{ t('actionFold') }}
        </button>

        <button
          v-if="session.snapshot.value.legalActions.canCheck"
          type="button"
          class="min-h-13 rounded-2xl border border-emerald-500/40 bg-zinc-800 text-sm font-extrabold text-emerald-300 active:scale-[0.98]"
          @click="session.sendGameAction('CHECK')"
        >
          {{ t('actionCheck') }}
        </button>

        <button
          v-else-if="session.snapshot.value.legalActions.canCall"
          type="button"
          class="tabular-chips min-h-13 rounded-2xl bg-emerald-500 px-2 text-sm font-extrabold text-zinc-950 active:scale-[0.98]"
          @click="session.sendGameAction('CALL')"
        >
          {{
            t('actionCall', {
              amount: formatChips(
                session.snapshot.value.legalActions.callDelta,
                locale,
              ),
            })
          }}
        </button>

        <button
          v-if="
            session.snapshot.value.legalActions.canBet ||
            session.snapshot.value.legalActions.canRaise
          "
          type="button"
          class="min-h-13 rounded-2xl bg-amber-500 text-sm font-extrabold text-zinc-950 active:scale-[0.98]"
          @click="raiseDialogRef?.open()"
        >
          {{
            session.snapshot.value.legalActions.canBet
              ? t('actionBet')
              : t('actionRaise')
          }}
        </button>

        <button
          v-else-if="session.snapshot.value.legalActions.canAllIn"
          type="button"
          class="tabular-chips min-h-13 rounded-2xl bg-amber-500 px-2 text-xs font-extrabold text-zinc-950 active:scale-[0.98]"
          @click="session.sendGameAction('ALL_IN')"
        >
          {{
            t('actionAllIn', {
              amount: formatChips(
                session.snapshot.value.legalActions.maxBetOrRaiseTo,
                locale,
              ),
            })
          }}
        </button>
      </div>
    </div>

    <!-- Subtle Creator Footer -->
    <AppFooterBar />

    <!-- Native Modal Dialogs -->
    <RaiseSheetDialog
      v-if="session.snapshot.value?.legalActions"
      ref="raiseDialogRef"
      :legal-actions="session.snapshot.value.legalActions"
      :big-blind="currentBlindLevel.bigBlind"
      @confirm="(act, amt) => session.sendGameAction(act, amt)"
    />

    <PlayerManagerDialog
      v-if="session.role.value === 'HOST' && session.snapshot.value"
      :open="playerManagerOpen"
      :snapshot="session.snapshot.value"
      :focused-player-id="focusedPlayerId"
      @close="playerManagerOpen = false"
      @skip-turn="session.forceSkipTurn()"
      @set-sitting-out="(pid, out) => session.setSittingOut(pid, out)"
      @adjust-stack="(pid, stk) => session.adjustPlayerStack(pid, stk)"
      @rebuy="(pid) => session.rebuyPlayer(pid)"
      @addon="(pid) => session.addonPlayer(pid)"
      @kick="(pid) => session.kickPlayer(pid)"
    />

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

    <!-- Hand Rankings Cheat-Sheet Dialog -->
    <dialog
      ref="handRankingsDialogEl"
      v-bind="{ closedby: 'any' } as Record<string, unknown>"
      class="m-auto w-[min(95vw,30rem)] max-h-[85dvh] rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 shadow-2xl backdrop:bg-black/75"
    >
      <HandRankingsPanel show-close-button @close="closeHandRankingsModal" />
    </dialog>

    <!-- Mobile Table Action Timeline Dialog -->
    <dialog
      v-if="session.snapshot.value"
      ref="mobileTimelineDialogEl"
      v-bind="{ closedby: 'any' } as Record<string, unknown>"
      class="m-auto w-[min(95vw,28rem)] h-[75dvh] rounded-2xl border border-zinc-800 bg-zinc-900 p-1 text-zinc-100 shadow-2xl backdrop:bg-black/75"
    >
      <TableTimelinePanel
        :entries="session.snapshot.value.actionLog"
        show-close-button
        @close="closeMobileTimelineModal"
      />
    </dialog>
  </div>
</template>
