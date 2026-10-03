import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, compareEngine } from '@kosta/simulation';
import type { ComparisonJob, ComparisonReply } from './comparison.worker';
import { runComparison } from './comparisonClient';
import { AbortedError } from './api';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<ComparisonReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}
const job = (): ComparisonJob => ({ engine: createEngine(), sessionId: 'a', revision: 0, options: { maintenanceMinutes: 10, reserveSetupMinutes: 5 } });

describe('comparison worker lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('does not start cancelled work', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runComparison(job(), controller.signal)).rejects.toBeInstanceOf(AbortedError);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('delivers the completed calculation and removes its timer and abort listener', async () => {
    const input = job();
    const controller = new AbortController();
    const pending = runComparison(input, controller.signal);
    const result = { ...compareEngine(input.engine, input.options), sessionId: input.sessionId, revision: input.revision };
    FakeWorker.instances[0].onmessage?.({ data: { result } } as MessageEvent<ComparisonReply>);
    expect(await pending).toEqual(result);
    controller.abort();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates a cancelled calculation without affecting another calculation', async () => {
    const first = new AbortController();
    const second = new AbortController();
    const a = runComparison(job(), first.signal);
    const b = runComparison(job(), second.signal);
    first.abort();
    await expect(a).rejects.toBeInstanceOf(AbortedError);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.instances[1].terminate).not.toHaveBeenCalled();
    second.abort();
    await expect(b).rejects.toBeInstanceOf(AbortedError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates a stalled worker and exposes a retryable error', async () => {
    const pending = runComparison(job(), new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('слишком много времени');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up a worker that cannot load', async () => {
    const pending = runComparison(job(), new AbortController().signal);
    FakeWorker.instances[0].onerror?.();
    await expect(pending).rejects.toThrow('запустить расчёт');
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
