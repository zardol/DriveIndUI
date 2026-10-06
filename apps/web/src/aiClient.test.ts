import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_MODEL } from '@driveindui/shared';
import { fetchAiStatus, normalizeAiAccessCode, normalizeAiUrl } from './aiClient';

afterEach(() => vi.unstubAllGlobals());

describe('AI endpoint configuration', () => {
  it('permits HTTPS servers and local HTTP only', () => {
    expect(normalizeAiUrl('https://example.com/')).toBe('https://example.com');
    expect(normalizeAiUrl('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
    expect(normalizeAiUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });
  it('rejects credentials or tokens in URLs and insecure remote servers', () => {
    for (const url of ['http://example.com', 'https://name:secret@example.com', 'https://example.com?token=secret', 'https://example.com#secret', 'javascript:alert(1)']) {
      expect(() => normalizeAiUrl(url)).toThrow();
    }
  });
});

describe('AI access verification', () => {
  const signal = () => new AbortController().signal;
  const setup = (body: unknown, status = 200) => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
  };
  it('sends the normalized code to the status endpoint and requires explicit authorization', async () => {
    const fetcher = setup({ configured: true, model: AI_MODEL, accessRequired: true, authorized: true });
    expect(normalizeAiAccessCode(' \u202A presentation-code\u200B\r\n')).toBe('presentation-code');
    expect((await fetchAiStatus('https://api.example', signal(), ' \u202A presentation-code\u200B\r\n')).authorized).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://api.example/api/ai/status', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-AI-Access': 'presentation-code' }) }));
  });
  it('does not mistake old-server availability for verified access', async () => {
    setup({ configured: true, model: AI_MODEL, accessRequired: true });
    expect((await fetchAiStatus('https://api.example', signal(), 'presentation-code')).authorized).toBe(false);
  });
  it('preserves a rejected-code error and blocks pasted API keys or instruction text before transmission', async () => {
    const fetcher = setup({ error: 'AI_ACCESS_INVALID', message: 'Код доступа не принят.' }, 401);
    await expect(fetchAiStatus('https://api.example', signal(), 'wrong-code')).rejects.toMatchObject({ code: 'AI_ACCESS_INVALID', message: 'Код доступа не принят.' });
    fetcher.mockClear();
    for (const code of ['sk-test-not-a-real-key', 'DriveIndUI — код доступа\npresentation-code\nИнструкция']) {
      await expect(fetchAiStatus('https://api.example', signal(), code)).rejects.toMatchObject({ code: 'AI_ACCESS_INVALID' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
