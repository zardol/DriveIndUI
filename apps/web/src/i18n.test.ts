import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { resolve } from 'node:path';
import { messages, t } from './i18n';
import { getPreferences, parsePreferences, setPreferences } from './preferences';
import { formatDuration, formatOne } from './format';

afterEach(() => setPreferences({ language: 'ru', theme: 'light' }));
describe('interface localization', () => {
  it('preserves all placeholder identities in both translations', () => {
    const slots = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    for (const [source, values] of Object.entries(messages)) {
      expect(values, source).toHaveLength(2);
      for (const value of values) { expect(value.length, source).toBeGreaterThan(0); expect(slots(value), source).toEqual(slots(source)); }
    }
  });
  it('translates dynamic times, queue states and nested station names', () => {
    expect(t('Через ≈ 12,5 мин', 'en')).toBe('In ≈ 12,5 min');
    expect(t('Не заполнится за 30 мин', 'kk')).toBe('30 минут ішінде толмайды');
    expect(t('Сварка: поток ограничен', 'en')).toBe('Welding: flow restricted');
    expect(t('2 ожидают · 1 подъезжают', 'en')).toBe('2 waiting · 1 approaching');
    expect(t('1 ч 05 мин', 'kk')).toBe('1 сағ 05 мин');
    expect(t('  План ', 'en')).toBe('  Plan ');
  });
  it('keeps source and domain data intact, and handles unknown text', () => {
    const data = { label: 'Мой набор данных', count: 700 };
    expect(t(data, 'en')).toBe(data);
    expect(t('Мой набор данных', 'en')).toBe('Мой набор данных');
    expect(t('Onix', 'kk')).toBe('Onix');
    expect(t('План', 'ru')).toBe('План');
  });
  it('formats durations and decimal numbers using the current language', () => {
    setPreferences({ language: 'en' }); expect(formatDuration(3905)).toBe('1 h 05 min'); expect(formatOne(12.5)).toBe('12.5');
    setPreferences({ language: 'kk' }); expect(formatDuration(125)).toBe('2 мин 05 с');
  });
  it('handles absent, corrupt or unsupported saved settings', () => {
    for (const raw of [null, 'bad json', 'null', '42', '{"language":"xx","theme":"purple"}']) expect(parsePreferences(raw)).toEqual({ language: 'ru', theme: 'light' });
    expect(parsePreferences('{"language":"kk","theme":"dark"}')).toEqual({ language: 'kk', theme: 'dark' });
    setPreferences({ theme: 'dark' }); setPreferences({ language: 'en' }); expect(getPreferences()).toEqual({ language: 'en', theme: 'dark' });
  });
  it('covers every Russian source phrase and template used by the interface and model messages', () => {
    const missing = new Set<string>();
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = resolve(directory, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'locales') walk(file); continue; }
        if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue;
        const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node) => {
          let value = '';
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) value = node.text;
          else if (ts.isTemplateExpression(node)) value = node.head.text + node.templateSpans.map((span, index) => '{' + index + '}' + span.literal.text).join('');
          else if (ts.isJsxText(node)) value = node.text;
          value = value.replace(/\s+/g, ' ').trim();
          if (/[А-Яа-яЁё]/.test(value) && !['Русский', 'Қазақша'].includes(value) && !messages[value]) missing.add(value);
          ts.forEachChild(node, visit);
        };
        visit(tree);
      }
    };
    for (const directory of ['apps/web/src', 'packages/shared/src', 'packages/simulation/src']) walk(resolve(directory));
    expect([...missing]).toEqual([]);
  });
});
