import { describe, expect, it } from 'vitest';
import { pageFromHash, pageHref, WORKSPACES } from './navigation';

describe('static-host navigation', () => {
  it('resolves every shareable page URL', () => {
    for (const page of WORKSPACES) expect(pageFromHash(pageHref(page.id))).toBe(page.id);
  });
  it('preserves old bookmarks and handles unknown locations', () => {
    expect(pageFromHash('#flow')).toBe('factory');
    expect(pageFromHash('#case-plan')).toBe('plan');
    expect(pageFromHash('#legend')).toBe('data');
    expect(pageFromHash('#/missing')).toBe('overview');
    expect(pageFromHash('')).toBe('overview');
  });
});
