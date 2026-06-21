// tier-gate spec coverage — the pure limit table + `assertWithinQuota` guard.
// Maps to openspec/changes/tier-gate/specs/tier-gate/spec.md: the per-tier quota
// table (free numbers from PRD §7, PRO unlimited) and the at/over-limit boundary.

import { describe, expect, it } from 'vitest';
import {
  RESOURCES,
  TIER_LIMITS,
  QUOTA_EXCEEDED,
  QuotaError,
  assertWithinQuota,
  type Resource,
} from '../src/core/tier';

describe('TIER_LIMITS (1.2)', () => {
  it('FREE matches the published PRD §7 numbers', () => {
    expect(TIER_LIMITS.FREE).toEqual({ folders: 5, prompts: 25, profiles: 3, tags: 10 });
  });

  it('PRO is unlimited for every resource', () => {
    for (const r of RESOURCES) expect(TIER_LIMITS.PRO[r]).toBe(Infinity);
  });
});

describe('assertWithinQuota boundaries on FREE (1.4/1.5)', () => {
  for (const resource of RESOURCES) {
    const limit = TIER_LIMITS.FREE[resource];

    it(`${resource}: allows count = limit-1 (${limit - 1})`, () => {
      expect(() => assertWithinQuota(resource, limit - 1, 'FREE')).not.toThrow();
    });

    it(`${resource}: rejects count = limit (${limit}) with quota_exceeded + detail`, () => {
      let thrown: unknown;
      try {
        assertWithinQuota(resource, limit, 'FREE');
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(QuotaError);
      expect((thrown as QuotaError).code).toBe(QUOTA_EXCEEDED);
      expect((thrown as QuotaError).detail).toEqual({ resource, count: limit, limit });
    });

    it(`${resource}: rejects count = limit+1 (${limit + 1})`, () => {
      expect(() => assertWithinQuota(resource, limit + 1, 'FREE')).toThrow(QuotaError);
    });
  }
});

describe('PRO is unlimited (1.5)', () => {
  for (const resource of RESOURCES) {
    it(`${resource}: never rejects, even far above the free limit`, () => {
      expect(() => assertWithinQuota(resource, 10_000, 'PRO')).not.toThrow();
    });
  }
});

describe('QuotaError shape (1.3)', () => {
  it('carries the stable code and the structured detail', () => {
    const detail = { resource: 'folders' as Resource, count: 5, limit: 5 };
    const err = new QuotaError(detail);
    expect(err.code).toBe(QUOTA_EXCEEDED);
    expect(err.detail).toEqual(detail);
    expect(err).toBeInstanceOf(Error);
  });
});
