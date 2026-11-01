import { computed, ref } from 'vue';
import type { LocaleCode } from '../utils/format.js';
import enJson from './locales/en.json';
import esJson from './locales/es.json';
import ptBrJson from './locales/pt-BR.json';

const STORAGE_KEY = 'sidepot:locale';

export type TranslationKey = keyof typeof ptBrJson;

export interface LocaleOption {
  readonly code: LocaleCode;
  readonly flag: string;
  readonly shortLabel: string;
  readonly name: string;
}

export const SUPPORTED_LOCALES: readonly LocaleOption[] = [
  { code: 'pt-BR', flag: '🇧🇷', shortLabel: 'PT', name: 'Português (BR)' },
  { code: 'en', flag: '🇺🇸', shortLabel: 'EN', name: 'English' },
  { code: 'es', flag: '🇪🇸', shortLabel: 'ES', name: 'Español' },
] as const;

const PT_BR_MESSAGES: Readonly<Record<TranslationKey, string>> = ptBrJson;
const EN_MESSAGES: Readonly<Record<TranslationKey, string>> = enJson;
const ES_MESSAGES: Readonly<Record<TranslationKey, string>> = esJson;

export const DICTIONARIES: Readonly<
  Record<LocaleCode, Readonly<Record<TranslationKey, string>>>
> = {
  'pt-BR': PT_BR_MESSAGES,
  en: EN_MESSAGES,
  es: ES_MESSAGES,
};

function detectInitialLocale(): LocaleCode {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt-BR' || saved === 'en' || saved === 'es') {
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
  const order: readonly LocaleCode[] = ['pt-BR', 'en', 'es'];
  const idx = order.indexOf(currentLocale.value);
  const next = order[(idx + 1) % order.length] ?? 'pt-BR';
  setLocale(next);
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
    locales: SUPPORTED_LOCALES,
    setLocale,
    toggleLocale,
    t,
  };
}
