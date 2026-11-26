import ar from './ar.json';
import en from './en.json';
import type { BusStop, Lang } from '../types/transit';

export type Translations = typeof en;

export const TRANSLATIONS: Record<Lang, Translations> = {
  en,
  ar,
};

export const EXPORT_FILENAME = 'tetouan-lines.json';

export function getDir(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function isArabicScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function resolveHubName(hubKey: string, lang: Lang): string {
  const dict = TRANSLATIONS[lang].hubs as Record<string, string>;
  return dict[hubKey] ?? hubKey;
}

export interface ResolvedLabel {
  text: string;
  dir: 'ltr' | 'rtl';
}

export function resolveStopLabel(
  stop: Pick<BusStop, 'hub_key' | 'name_en' | 'name_ar'>,
  lang: Lang,
): ResolvedLabel {
  const enName = stop.name_en.trim();
  const arName = stop.name_ar.trim();

  if (lang === 'ar') {
    if (arName) {
      return { text: arName, dir: 'rtl' };
    }
    if (stop.hub_key) {
      return { text: resolveHubName(stop.hub_key, 'ar'), dir: 'rtl' };
    }
    if (enName && enName !== 'Bus Stop') {
      return {
        text: enName,
        dir: isArabicScript(enName) ? 'rtl' : 'ltr',
      };
    }
    return {
      text: ar.explorer.unnamedStop,
      dir: 'rtl',
    };
  }

  if (enName && enName !== 'Bus Stop') {
    return {
      text: enName,
      dir: isArabicScript(enName) ? 'rtl' : 'ltr',
    };
  }
  if (stop.hub_key) {
    return { text: resolveHubName(stop.hub_key, 'en'), dir: 'ltr' };
  }
  if (arName) {
    return { text: arName, dir: 'rtl' };
  }
  return {
    text: en.explorer.unnamedStop,
    dir: 'ltr',
  };
}

export function formatMad(amount: number): string {
  return amount.toFixed(2);
}
