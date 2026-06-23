// Identity coverage (observability spec "Anonymous identity", D-OBS-6). Diagnostics
// is the only telemetry stream and carries NO per-user identity: every built event
// ships the single fixed anonymous constant as its `distinct_id`.

import { describe, expect, it } from 'vitest';
import { ANON_DISTINCT_ID } from '../src/core/observability/identity';
import { buildEvent } from '../src/core/observability/builder';

describe('Anonymous diagnostics identity (D-OBS-6)', () => {
  it('the anonymous id is a fixed, non-empty constant', () => {
    expect(typeof ANON_DISTINCT_ID).toBe('string');
    expect(ANON_DISTINCT_ID.length).toBeGreaterThan(0);
  });

  it('an adapter-health event carries the fixed anonymous distinct_id', async () => {
    const built = await buildEvent({
      name: 'adapter_recovered',
      props: { platform: 'claude', configVer: '1.0' },
    });
    expect(built.distinct_id).toBe(ANON_DISTINCT_ID);
  });

  it('an $exception event carries the fixed anonymous distinct_id', async () => {
    const built = await buildEvent({
      name: '$exception',
      source: 'service_worker',
      error: { name: 'Error', message: 'boom', stack: '' },
    });
    expect(built.distinct_id).toBe(ANON_DISTINCT_ID);
  });
});
