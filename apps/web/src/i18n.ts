import catalog from './locales/catalog.json';
import { getPreferences, type Language } from './preferences';
// Russian source phrases are stable keys. Placeholders also cover messages produced by shared calculations.
export const messages: Record<string, readonly string[]> = catalog;
const caches = { kk: new Map<string, string>(), en: new Map<string, string>() };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).map(([key, values]) => {
  const ids: string[] = [];
  const parts = key.split(/(\{\d+\})/g).map(part => /^\{\d+\}$/.test(part) ? (ids.push(part), '(.*?)') : escapeRegex(part));
  return { regex: new RegExp('^' + parts.join('') + '$'), ids, values, length: key.length };
}).sort((a, b) => b.length - a.length);
function translate(value: string, language: Exclude<Language, 'ru'>, depth = 0): string {
  if (!value || depth > 3) return value;
  const cache = caches[language];
  const cached = cache.get(value); if (cached !== undefined) return cached;
  const source = value.replace(/\s+/g, ' ').trim();
  const index = language === 'kk' ? 0 : 1;
  let result = messages[source]?.[index];
  if (result === undefined) for (const pattern of patterns) {
    const match = source.match(pattern.regex); if (!match) continue;
    result = pattern.values[index].replace(/\{\d+\}/g, token => translate(match[pattern.ids.indexOf(token) + 1] ?? token, language, depth + 1));
    break;
  }
  if (result === undefined && source.includes(' · ')) result = source.split(' · ').map(part => translate(part, language, depth + 1)).join(' · ');
  if (result === undefined) return value; // User-imported/source text and AI reports retain their original language.
  const output = (value.match(/^\s*/)?.[0] ?? '') + result + (value.match(/\s*$/)?.[0] ?? '');
  if (cache.size >= 2000) cache.clear(); cache.set(value, output);
  return output;
}
/** Translate display text only. Values, React elements and domain data are never mutated. */
export function t<T>(value: T, language: Language = getPreferences().language): T {
  if (language === 'ru') return value;
  if (typeof value === 'string') return translate(value, language) as T;
  if (Array.isArray(value)) return value.map(item => t(item, language)) as T;
  return value;
}
