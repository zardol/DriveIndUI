import { describe, expect, it } from 'vitest';
import { normalizeAiUrl } from './aiClient';

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
