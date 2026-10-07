// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement as h, Fragment, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TopBar } from './TopBar';
import { ControlBar } from './ControlBar';
import { CasePanel } from './CasePanel';
import { AiWorkspace } from './AiWorkspace';
import { getPreferences, PREFERENCES_KEY, setPreferences, usePreferences } from '../preferences';
import { createEngine, getSnapshot } from '@driveindui/simulation';
import { createCaseConfig, type SessionSnapshot } from '@driveindui/shared';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
const snapshot = (): SessionSnapshot => ({ ...getSnapshot(createEngine({ config: createCaseConfig() })), sessionId: 'ui-test', revision: 0, running: false, speed: 1, updatedAt: '2026-10-07T00:00:00.000Z' });
const click = async (element: Element | null) => { expect(element).not.toBeNull(); await act(async () => { (element as HTMLElement).click(); }); };
const byText = (text: string) => [...document.querySelectorAll('button')].find(button => button.textContent === text) ?? null;
beforeEach(() => { localStorage.clear(); setPreferences({ language: 'ru', theme: 'light' }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('interface interactions', () => {
  it('switches and persists language/theme without resetting mounted shift state', async () => {
    function Harness() {
      usePreferences(); const [count, setCount] = useState(0);
      return h(Fragment, null, h(TopBar, { connection: 'online', sessionId: 'same-shift' }), h('button', { onClick: () => setCount(count + 1), 'data-count': count }, 'Count'), h(ControlBar, { snapshot: snapshot(), pending: false, offline: false, error: null, onCommand: vi.fn(), onDismissError: vi.fn() }));
    }
    await act(async () => root.render(h(Harness)));
    await click(byText('Count')); await click(byText('ENG'));
    expect(document.documentElement.lang).toBe('en'); expect(host.querySelector('.session-play')?.textContent).toBe('Start');
    expect(host.querySelector('[data-count]')?.getAttribute('data-count')).toBe('1');
    await click(host.querySelector('[aria-label="Use dark theme"]'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!)).toEqual({ language: 'en', theme: 'dark' });
    await click(byText('KZ')); expect(document.documentElement.lang).toBe('kk'); expect(host.querySelector('.session-play')?.textContent).toBe('Бастау');
    await click(byText('RU')); expect(host.textContent).toContain('Сценарий');
    expect(host.querySelector('[data-count]')?.getAttribute('data-count')).toBe('1');
  });
  it('opens timer help above the page, closes on Escape/outside and preserves playback controls', async () => {
    const onCommand = vi.fn();
    await act(async () => root.render(h(ControlBar, { snapshot: snapshot(), pending: false, offline: false, error: null, onCommand, onDismissError: vi.fn() })));
    const info = host.querySelector('[aria-label="Информация о смене"]')!;
    await click(info); const dialog = document.querySelector('[role="dialog"]')!;
    expect(host.contains(dialog)).toBe(false); expect(dialog.textContent).toContain('План и скорость сохраняются.');
    expect(info.getAttribute('aria-expanded')).toBe('true'); expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(info);
    await click(info); await act(async () => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(host.querySelector('[aria-label="Запустить смену"]')); expect(onCommand).toHaveBeenCalledWith({ action: 'play' });
  });
  it.each(['ru', 'kk', 'en'] as const)('renders the original-data note in %s and keeps plan editing usable', async language => {
    setPreferences({ language }); const onCommand = vi.fn();
    await act(async () => root.render(h(CasePanel, { snapshot: snapshot(), disabled: false, onCommand, view: 'plan' })));
    expect(host.querySelector('.case-source-note')?.textContent).toContain('700');
    expect(host.textContent).not.toContain('План действует в симуляции');
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(5);
    await click(host.querySelector('.case-actions .btn--primary'));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ action: 'setConfiguration' }));
  });
  it('prompts for the AI code on an enabled analysis button, without sending a paid request', async () => {
    setPreferences({ language: 'en' }); const fetch = vi.spyOn(globalThis, 'fetch');
    await act(async () => root.render(h(AiWorkspace, { snapshot: snapshot(), active: false, disabled: false, onStation: vi.fn() })));
    const analyse = byText('Analyse risks') as HTMLButtonElement; expect(analyse.disabled).toBe(false); await click(analyse);
    expect(host.textContent).toContain('Enter the access code');
    expect(host.querySelector('input[type="password"]')).toBe(document.activeElement);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps controls usable if preference storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Private mode'); });
    await act(async () => root.render(h(TopBar, { connection: 'online', sessionId: null })));
    await click(byText('ENG')); await click(host.querySelector('[aria-label="Use dark theme"]'));
    expect(getPreferences()).toEqual({ language: 'en', theme: 'dark' });
  });
});
