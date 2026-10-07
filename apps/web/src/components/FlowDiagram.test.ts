// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement as h, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createEngine, getSnapshot } from '@driveindui/simulation';
import { createCaseConfig } from '@driveindui/shared';
import { FlowDiagram } from './FlowDiagram';
import { readFileSync } from 'node:fs';
const css = readFileSync('apps/web/src/stage2-flow.css', 'utf8');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root, styles: HTMLStyleElement;
const snapshot = getSnapshot(createEngine({ config: createCaseConfig() }));
const running = { ...snapshot, stations: snapshot.stations.map(station => ({ ...station, status: 'running' as const, inProcess: true, progress: 0.5 })) };
const diagram = (animate = true) => h(FlowDiagram, { snapshot: running, selected: 'welding', animate, stale: false, onSelect: vi.fn() });
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  styles = document.createElement('style'); styles.textContent = css; document.head.append(styles);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); styles.remove(); });

describe('2D equipment animation boundaries', () => {
  it('anchors scaling to the spark instead of the entire line viewport', async () => {
    await act(async () => root.render(diagram()));
    const spark = host.querySelector('.anim-spark')!;
    const style = getComputedStyle(spark);
    expect(style.transformBox).toBe('fill-box');
    expect(style.transformOrigin).toBe('center');
    expect(spark.closest('.equip-welding')).not.toBeNull();
    expect(host.querySelector('.equip-supply .anim-spark')).toBeNull();
  });

  it('keeps each equipment scene clipped to its own frame even with two diagrams mounted', async () => {
    await act(async () => root.render(h(Fragment, null, diagram(), diagram())));
    const clips = [...host.querySelectorAll('clipPath')];
    expect(clips).toHaveLength(12);
    expect(new Set(clips.map(clip => clip.id)).size).toBe(clips.length);
    for (const bay of host.querySelectorAll('.equip-bay')) {
      const clip = bay.querySelector('clipPath')!;
      const contents = bay.querySelector('g[clip-path]')!;
      expect(contents.getAttribute('clip-path')).toBe(`url(#${clip.id})`);
      expect(contents.querySelector('.equip-rail-base')).not.toBeNull();
      expect(contents.querySelector('[class^="equip-"]:not(line)')).not.toBeNull();
      const frame = bay.querySelector('.equip-bg')!;
      const bounds = clip.querySelector('rect')!;
      for (const dimension of ['width', 'height', 'rx']) expect(bounds.getAttribute(dimension)).toBe(frame.getAttribute(dimension));
      expect(contents.contains(frame)).toBe(false);
    }
  });

  it('removes moving effects on pause without changing the clipping references', async () => {
    await act(async () => root.render(diagram()));
    const clips = [...host.querySelectorAll('clipPath')].map(clip => clip.id);
    expect(host.querySelector('.anim-spark')).not.toBeNull();
    await act(async () => root.render(diagram(false)));
    expect(host.querySelector('[class^="anim-"], .is-moving, .is-flowing')).toBeNull();
    expect([...host.querySelectorAll('clipPath')].map(clip => clip.id)).toEqual(clips);
  });
});
