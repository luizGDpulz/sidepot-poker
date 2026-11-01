import type { HandStreet } from '@sidepot/core';

export type LocaleCode = 'pt-BR' | 'en';

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
): string {
  const mapPt: Readonly<Record<HandStreet, string>> = {
    IDLE: 'Aguardando Mão',
    PREFLOP: 'Pré-Flop',
    FLOP: 'Flop',
    TURN: 'Turn',
    RIVER: 'River',
    SHOWDOWN: 'Showdown',
    COMPLETE: 'Torneio Encerrado',
  };
  const mapEn: Readonly<Record<HandStreet, string>> = {
    IDLE: 'Waiting Next Hand',
    PREFLOP: 'Pre-Flop',
    FLOP: 'Flop',
    TURN: 'Turn',
    RIVER: 'River',
    SHOWDOWN: 'Showdown',
    COMPLETE: 'Tournament Complete',
  };
  return locale === 'pt-BR' ? mapPt[street] : mapEn[street];
}
