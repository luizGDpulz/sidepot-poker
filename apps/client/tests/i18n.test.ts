import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate, type TranslationKey } from '../src/i18n/index.js';
import {
  formatChips,
  formatClock,
  formatStreetBadge,
} from '../src/utils/format.js';

describe('@sidepot/client i18n & formatting utilities', () => {
  it('maintains 1:1 translation key parity between pt-BR and en', () => {
    const ptKeys = Object.keys(DICTIONARIES['pt-BR']).sort();
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    expect(enKeys).toEqual(ptKeys);

    for (const key of ptKeys as TranslationKey[]) {
      expect(DICTIONARIES['pt-BR'][key].length).toBeGreaterThan(0);
      expect(DICTIONARIES.en[key].length).toBeGreaterThan(0);
    }
  });

  it('interpolates dynamic placeholders accurately in both locales', () => {
    expect(translate('pt-BR', 'blindsDisplay', { sb: 25, bb: 50 })).toBe(
      'Blinds 25/50',
    );
    expect(translate('en', 'actionCall', { amount: '1.200' })).toBe(
      'Call 1.200',
    );
  });

  it('formats tabular chip counts, countdown timers and street labels', () => {
    expect(formatChips(15000, 'en')).toBe('15,000');
    expect(formatChips(15000, 'pt-BR')).toBe('15.000');
    expect(formatClock(905)).toBe('15:05');
    expect(formatClock(0)).toBe('00:00');
    expect(formatStreetBadge('PREFLOP', 'pt-BR')).toBe('Pré-Flop');
    expect(formatStreetBadge('SHOWDOWN', 'en')).toBe('Showdown');
  });
});
