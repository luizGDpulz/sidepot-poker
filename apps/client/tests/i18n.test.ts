import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate, type TranslationKey } from '../src/i18n/index.js';
import {
  formatChips,
  formatClock,
  formatStreetBadge,
} from '../src/utils/format.js';

describe('@sidepot/client i18n & formatting utilities', () => {
  it('maintains 1:1:1 translation key parity across pt-BR, en and es JSON files', () => {
    const ptKeys = Object.keys(DICTIONARIES['pt-BR']).sort();
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    const esKeys = Object.keys(DICTIONARIES.es).sort();
    expect(enKeys).toEqual(ptKeys);
    expect(esKeys).toEqual(ptKeys);

    for (const key of ptKeys as TranslationKey[]) {
      expect(DICTIONARIES['pt-BR'][key].length).toBeGreaterThan(0);
      expect(DICTIONARIES.en[key].length).toBeGreaterThan(0);
      expect(DICTIONARIES.es[key].length).toBeGreaterThan(0);
    }
  });

  it('interpolates dynamic placeholders accurately across locales', () => {
    expect(translate('pt-BR', 'blindsDisplay', { sb: 25, bb: 50 })).toBe(
      'Blinds 25/50',
    );
    expect(translate('en', 'actionCall', { amount: '1.200' })).toBe(
      'Call 1.200',
    );
    expect(translate('es', 'blindsDisplay', { sb: 25, bb: 50 })).toBe(
      'Ciegas 25/50',
    );
  });

  it('formats tabular chip counts, countdown timers and street labels (distinguishing Hand Complete from Tournament Over)', () => {
    expect(formatChips(15000, 'en')).toBe('15,000');
    expect(formatChips(15000, 'pt-BR')).toBe('15.000');
    expect(formatClock(905)).toBe('15:05');
    expect(formatClock(0)).toBe('00:00');
    expect(formatStreetBadge('PREFLOP', 'pt-BR')).toBe('Pré-Flop');
    expect(formatStreetBadge('SHOWDOWN', 'en')).toBe('Showdown');
    expect(formatStreetBadge('COMPLETE', 'pt-BR', false)).toBe('Mão Concluída');
    expect(formatStreetBadge('COMPLETE', 'pt-BR', true)).toBe('Torneio Encerrado');
    expect(formatStreetBadge('COMPLETE', 'es', false)).toBe('Mano Completada');
  });
});
