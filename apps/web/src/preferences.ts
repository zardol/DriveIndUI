import { useSyncExternalStore } from 'react';
export type Language = 'ru' | 'kk' | 'en';
export type Theme = 'light' | 'dark';
export interface Preferences { language: Language; theme: Theme }
export const PREFERENCES_KEY = 'driveindui.preferences';
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? '{}');
    return { language: ['ru', 'kk', 'en'].includes(value?.language) ? value.language : 'ru', theme: value?.theme === 'dark' ? 'dark' : 'light' };
  } catch { return { language: 'ru', theme: 'light' }; }
}
function initial(): Preferences {
  try { return parsePreferences(window.localStorage.getItem(PREFERENCES_KEY)); } catch { return parsePreferences(null); }
}
let current = initial();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getPreferences = () => current;
export const locale = () => ({ ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }[current.language]);
function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = current.theme;
  document.documentElement.lang = current.language;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current.theme === 'dark' ? '#101c19' : '#f2f4f0');
}
export function setPreferences(change: Partial<Preferences>) {
  current = parsePreferences(JSON.stringify({ ...current, ...change }));
  try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(current)); } catch { /* Private mode still supports in-memory preferences. */ }
  apply(); listeners.forEach(listener => listener());
}
export function usePreferences() { return useSyncExternalStore(subscribe, getPreferences, getPreferences); }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== PREFERENCES_KEY && event.key !== null) return;
  current = parsePreferences(event.newValue); apply(); listeners.forEach(listener => listener());
});
apply();
