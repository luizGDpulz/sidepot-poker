import { computed, ref } from 'vue';
import type { LocaleCode } from '../utils/format.js';

const STORAGE_KEY = 'sidepot:locale';

const PT_BR_MESSAGES = {
  appTagline: 'Fichas em Tempo Real & Gestão de Torneio',
  langToggleLabel: 'EN',
  createTableTab: 'Criar Mesa',
  joinTableTab: 'Entrar em Mesa',
  tableNameLabel: 'Nome da Mesa / Torneio',
  tableNameHint: '2 a 40 caracteres (ex: Poker de Sexta)',
  tableNameError: 'Informe um nome entre 2 e 40 caracteres.',
  hostNameLabel: 'Seu Nome na Mesa (Opcional)',
  hostNameHint: 'Deixe em branco se você for apenas Dealer/Organizador',
  hostNameError: 'O nome deve ter até 24 caracteres.',
  startingStackLabel: 'Stack Inicial',
  maxSeatsLabel: 'Lugares na Mesa',
  blindPresetLabel: 'Estrutura de Blinds',
  presetTurbo: 'Turbo (10 min)',
  presetStandard: 'Standard (15 min)',
  presetDeepstack: 'Deepstack (20 min)',
  allowRebuysLabel: 'Permitir Re-buys (quando zerado)',
  allowAddOnLabel: 'Permitir Add-on',
  createTournamentBtn: 'Abrir Mesa Agora',
  creatingBtn: 'Criando Mesa...',
  roomIdLabel: 'Código da Sala',
  roomIdHint: 'Informe o ID da sala ou escaneie o QR Code do Host',
  roomIdError: 'Informe o código da sala.',
  inviteTokenLabel: 'Token de Convite',
  inviteTokenHint: 'Preenchido automaticamente pelo QR Code',
  inviteTokenError: 'Token de convite obrigatório.',
  playerNameLabel: 'Seu Apelido na Mesa',
  playerNameHint: '2 a 24 caracteres visíveis para todos na mesa',
  playerNameError: 'Informe seu apelido (2 a 24 caracteres).',
  requestSeatBtn: 'Solicitar Assento',
  joiningBtn: 'Enviando...',
  bouncerWaitingTitle: 'Aguardando Aprovação do Host',
  bouncerWaitingDesc:
    'Seu pedido chegou na fila da recepção (Bouncer). Assim que o Host aprovar, sua tela abrirá automaticamente.',
  bouncerRejectedTitle: 'Entrada Recusada pelo Host',
  bouncerRejectedDesc:
    'O organizador recusou esta solicitação. Fale com o Host ou tente novamente.',
  backHomeBtn: 'Voltar ao Início',
  roomLockedNotice: 'Sala trancada pelo Host — novas entradas bloqueadas.',
  statusConnected: 'Ao Vivo',
  statusReconnecting: 'Reconectando...',
  statusOffline: 'Desconectado',
  qrDialogTitle: 'Convites & Telão Smart TV',
  qrPlayerTab: 'QR Jogadores',
  qrTvTab: 'QR Smart TV (/tv)',
  qrHostAddressLabel: 'Endereço Base para QR Code (LAN / Domínio)',
  qrCopyLinkBtn: 'Copiar Link',
  qrCopiedBtn: 'Copiado!',
  qrOpenTvBtn: 'Abrir /tv',
  closeBtn: 'Fechar',
  cancelBtn: 'Cancelar',
  confirmBtn: 'Confirmar',
  handNumberLabel: 'Mão #{num}',
  blindLevelLabel: 'Nível {level}',
  blindsDisplay: 'Blinds {sb}/{bb}',
  anteDisplay: 'Ante {ante}',
  mainPotLabel: 'Pote Principal',
  totalPotLabel: 'Pote Total',
  yourStackLabel: 'Seu Stack',
  streetBetLabel: 'Na Rodada',
  yourTurnBanner: 'SUA VEZ DE AGIR',
  waitingForTurn: 'Aguardando ação da mesa...',
  spectatorHostMode: 'Modo Organizador (Sem Assento)',
  seatSelfBtn: 'Sentar na Mesa',
  actionFold: 'Fold',
  actionCheck: 'Check',
  actionCall: 'Pagar {amount}',
  actionBet: 'Apostar',
  actionRaise: 'Aumentar',
  actionAllIn: 'All-In ({amount})',
  raiseDialogTitle: 'Definir Valor Total na Rodada',
  presetMin: 'Mín',
  preset25x: '2.5x',
  presetHalfPot: '1/2 Pote',
  presetPot: 'Pote',
  presetAllIn: 'All-In',
  confirmWagerBtn: 'Confirmar {amount}',
  hostPanelTitle: 'Controle do Host',
  bouncerQueueTitle: 'Fila de Entrada (Bouncer)',
  bouncerEmpty: 'Nenhum jogador aguardando aprovação.',
  approveBtn: 'Aprovar',
  rejectBtn: 'Recusar',
  lockRoomBtn: 'Trancar Sala',
  unlockRoomBtn: 'Destrancar Sala',
  startHandBtn: 'Iniciar Próxima Mão',
  undoActionBtn: 'Desfazer Última Ação',
  clockRunBtn: 'Iniciar Clock',
  clockPauseBtn: 'Pausar Clock',
  clockNextLevelBtn: 'Avançar Nível',
  managePlayersTitle: 'Gestão de Fichas & Re-buy',
  rebuyBtn: 'Re-buy',
  addonBtn: 'Add-on',
  adjustStackBtn: 'Ajustar',
  kickBtn: 'Remover',
  adjustDialogTitle: 'Ajuste Manual de Stack',
  newStackLabel: 'Novo Stack Exato',
  newStackHint: 'Inteiro ≥ 0 (apenas entre mãos)',
  newStackError: 'Informe um valor inteiro válido.',
  showdownTitle: 'Resolver Showdown — Distribuir Potes',
  showdownSubtitle:
    'Selecione o vencedor de cada pote (marque 2+ jogadores em caso de Split Pot).',
  distributePotsBtn: 'Distribuir Fichas & Encerrar Mão',
  leaderboardTitle: 'Classificação do Torneio',
  championBannerTitle: 'Campeão do Torneio',
  eliminatedBadge: 'Eliminado',
  allInBadge: 'ALL-IN',
  foldedBadge: 'FOLD',
  waitingBadge: 'AGUARDANDO',
  tvReadOnlyBadge: 'MODO TV • SOMENTE LEITURA',
  tvWakeLockActive: 'Tela Sempre Ativa',
  emptySeatLabel: 'Lugar {num} Livre',
} as const;

export type TranslationKey = keyof typeof PT_BR_MESSAGES;

const EN_MESSAGES: Readonly<Record<TranslationKey, string>> = {
  appTagline: 'Real-Time Chips & Live Tournament Manager',
  langToggleLabel: 'PT',
  createTableTab: 'Create Table',
  joinTableTab: 'Join Table',
  tableNameLabel: 'Table / Tournament Name',
  tableNameHint: '2 to 40 characters (e.g. Friday Night Hold’em)',
  tableNameError: 'Enter a table name between 2 and 40 characters.',
  hostNameLabel: 'Your Seat Name (Optional)',
  hostNameHint: 'Leave blank if you are only the Dealer/Tournament Director',
  hostNameError: 'Name must be up to 24 characters.',
  startingStackLabel: 'Starting Stack',
  maxSeatsLabel: 'Max Seats',
  blindPresetLabel: 'Blind Structure',
  presetTurbo: 'Turbo (10 min)',
  presetStandard: 'Standard (15 min)',
  presetDeepstack: 'Deepstack (20 min)',
  allowRebuysLabel: 'Allow Re-buys (when busted)',
  allowAddOnLabel: 'Allow Add-on',
  createTournamentBtn: 'Launch Table Now',
  creatingBtn: 'Creating Table...',
  roomIdLabel: 'Room Code',
  roomIdHint: 'Enter room ID or scan the Host QR Code',
  roomIdError: 'Please enter the room code.',
  inviteTokenLabel: 'Invite Token',
  inviteTokenHint: 'Automatically filled via QR Code',
  inviteTokenError: 'Invite token is required.',
  playerNameLabel: 'Your Table Nickname',
  playerNameHint: '2 to 24 characters visible to everyone at the table',
  playerNameError: 'Enter your nickname (2 to 24 characters).',
  requestSeatBtn: 'Request Seat',
  joiningBtn: 'Sending...',
  bouncerWaitingTitle: 'Waiting for Host Approval',
  bouncerWaitingDesc:
    'Your request is in the Host Bouncer queue. Your table view will unlock automatically as soon as approved.',
  bouncerRejectedTitle: 'Join Request Declined',
  bouncerRejectedDesc:
    'The Host declined this join request. Check with the Host or try again.',
  backHomeBtn: 'Back to Home',
  roomLockedNotice: 'Room locked by Host — new entries blocked.',
  statusConnected: 'Live',
  statusReconnecting: 'Reconnecting...',
  statusOffline: 'Offline',
  qrDialogTitle: 'Player Invites & Smart TV Display',
  qrPlayerTab: 'Player QR',
  qrTvTab: 'Smart TV QR (/tv)',
  qrHostAddressLabel: 'Base Address for QR Code (LAN / Domain)',
  qrCopyLinkBtn: 'Copy Link',
  qrCopiedBtn: 'Copied!',
  qrOpenTvBtn: 'Open /tv',
  closeBtn: 'Close',
  cancelBtn: 'Cancel',
  confirmBtn: 'Confirm',
  handNumberLabel: 'Hand #{num}',
  blindLevelLabel: 'Level {level}',
  blindsDisplay: 'Blinds {sb}/{bb}',
  anteDisplay: 'Ante {ante}',
  mainPotLabel: 'Main Pot',
  totalPotLabel: 'Total Pot',
  yourStackLabel: 'Your Stack',
  streetBetLabel: 'In Street',
  yourTurnBanner: 'YOUR TURN TO ACT',
  waitingForTurn: 'Waiting for table action...',
  spectatorHostMode: 'Tournament Director Mode (Unseated)',
  seatSelfBtn: 'Take a Seat',
  actionFold: 'Fold',
  actionCheck: 'Check',
  actionCall: 'Call {amount}',
  actionBet: 'Bet',
  actionRaise: 'Raise',
  actionAllIn: 'All-In ({amount})',
  raiseDialogTitle: 'Set Total Street Wager',
  presetMin: 'Min',
  preset25x: '2.5x',
  presetHalfPot: '1/2 Pot',
  presetPot: 'Pot',
  presetAllIn: 'All-In',
  confirmWagerBtn: 'Confirm {amount}',
  hostPanelTitle: 'Host Controls',
  bouncerQueueTitle: 'Bouncer Approval Queue',
  bouncerEmpty: 'No players waiting for approval.',
  approveBtn: 'Approve',
  rejectBtn: 'Decline',
  lockRoomBtn: 'Lock Room',
  unlockRoomBtn: 'Unlock Room',
  startHandBtn: 'Deal Next Hand',
  undoActionBtn: 'Undo Last Action',
  clockRunBtn: 'Start Clock',
  clockPauseBtn: 'Pause Clock',
  clockNextLevelBtn: 'Next Level',
  managePlayersTitle: 'Chip Stack & Re-buy Manager',
  rebuyBtn: 'Re-buy',
  addonBtn: 'Add-on',
  adjustStackBtn: 'Adjust',
  kickBtn: 'Remove',
  adjustDialogTitle: 'Manual Stack Adjustment',
  newStackLabel: 'Exact New Stack',
  newStackHint: 'Integer ≥ 0 (between hands only)',
  newStackError: 'Enter a valid non-negative integer.',
  showdownTitle: 'Resolve Showdown — Award Pots',
  showdownSubtitle:
    'Select the winner for each pot (select 2+ players for a Split Pot).',
  distributePotsBtn: 'Award Chips & Complete Hand',
  leaderboardTitle: 'Tournament Standings',
  championBannerTitle: 'Tournament Champion',
  eliminatedBadge: 'Eliminated',
  allInBadge: 'ALL-IN',
  foldedBadge: 'FOLD',
  waitingBadge: 'WAITING',
  tvReadOnlyBadge: 'TV DISPLAY • READ-ONLY',
  tvWakeLockActive: 'Screen Wake Lock On',
  emptySeatLabel: 'Seat {num} Open',
};

export const DICTIONARIES: Readonly<
  Record<LocaleCode, Readonly<Record<TranslationKey, string>>>
> = {
  'pt-BR': PT_BR_MESSAGES,
  en: EN_MESSAGES,
};

function detectInitialLocale(): LocaleCode {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt-BR' || saved === 'en') {
      return saved;
    }
  }
  return 'pt-BR';
}

const currentLocale = ref<LocaleCode>(detectInitialLocale());

export function setLocale(next: LocaleCode): void {
  currentLocale.value = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }
}

export function toggleLocale(): void {
  setLocale(currentLocale.value === 'pt-BR' ? 'en' : 'pt-BR');
}

export function translate(
  locale: LocaleCode,
  key: TranslationKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const template = DICTIONARIES[locale][key];
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_match, paramName: string) => {
    const val = params[paramName];
    return val !== undefined ? String(val) : `{${paramName}}`;
  });
}

export function useI18n() {
  const locale = computed(() => currentLocale.value);

  const t = (
    key: TranslationKey,
    params?: Readonly<Record<string, string | number>>,
  ): string => translate(currentLocale.value, key, params);

  return {
    locale,
    setLocale,
    toggleLocale,
    t,
  };
}
