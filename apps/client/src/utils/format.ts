import type { HandStreet } from '@sidepot/core';

export type LocaleCode = 'pt-BR' | 'en' | 'es';

export function formatChips(
  amount: number,
  locale: LocaleCode = 'pt-BR',
): string {
  const safe = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return new Intl.NumberFormat(locale).format(safe);
}

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatStreetBadge(
  street: HandStreet,
  locale: LocaleCode,
  isTournamentOver = false,
): string {
  if (street === 'COMPLETE' && isTournamentOver) {
    if (locale === 'pt-BR') return 'Torneio Encerrado';
    if (locale === 'es') return 'Torneo Finalizado';
    return 'Tournament Complete';
  }
  const mapPt: Readonly<Record<HandStreet, string>> = {
    IDLE: 'Aguardando Mão',
    PREFLOP: 'Pré-Flop',
    FLOP: 'Flop',
    TURN: 'Turn',
    RIVER: 'River',
    SHOWDOWN: 'Showdown',
    COMPLETE: 'Mão Concluída',
  };
  const mapEn: Readonly<Record<HandStreet, string>> = {
    IDLE: 'Waiting Next Hand',
    PREFLOP: 'Pre-Flop',
    FLOP: 'Flop',
    TURN: 'Turn',
    RIVER: 'River',
    SHOWDOWN: 'Showdown',
    COMPLETE: 'Hand Complete',
  };
  const mapEs: Readonly<Record<HandStreet, string>> = {
    IDLE: 'Esperando Mano',
    PREFLOP: 'Pre-Flop',
    FLOP: 'Flop',
    TURN: 'Turn',
    RIVER: 'River',
    SHOWDOWN: 'Showdown',
    COMPLETE: 'Mano Completada',
  };
  if (locale === 'pt-BR') return mapPt[street];
  if (locale === 'es') return mapEs[street];
  return mapEn[street];
}
