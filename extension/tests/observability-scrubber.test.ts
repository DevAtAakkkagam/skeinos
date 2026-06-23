// Scrubber coverage (observability spec "Exception messages are scrubbed", task
// 8.2): long/denylisted messages are truncated and masked; host-page stack frames
// are dropped while own-bundle frames are kept as safe tokens.

import { describe, expect, it } from 'vitest';
import {
  MASK,
  MAX_MESSAGE_LEN,
  scrubException,
  scrubFrames,
  scrubMessage,
} from '../src/core/observability/scrubber';

describe('Message scrubbing (8.2)', () => {
  it('truncates an over-long message', () => {
    // Spaced short words so the message is long but trips no denylist run.
    const long = 'lorem ipsum dolor sit amet '.repeat(20);
    expect(long.length).toBeGreaterThan(MAX_MESSAGE_LEN);
    const out = scrubMessage(long);
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_LEN + 1); // +1 for the ellipsis
    expect(out.endsWith('…')).toBe(true);
  });

  it('masks an email address', () => {
    const out = scrubMessage('failed for user alice@example.com while saving');
    expect(out).not.toContain('alice@example.com');
    expect(out).toContain(MASK);
  });

  it('masks a URL that could carry a conversation id', () => {
    const out = scrubMessage('fetch failed: https://claude.ai/chat/secret-123?q=hello');
    expect(out).not.toContain('claude.ai/chat/secret-123');
    expect(out).toContain(MASK);
  });

  it('masks a bearer/JWT-ish token', () => {
    const out = scrubMessage('auth error eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 boom');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(out).toContain(MASK);
  });
});

describe('Stack frame filtering (8.2)', () => {
  const stack = [
    'TypeError: boom',
    '    at parse (chrome-extension://abcdef/content.js:42:13)',
    '    at onClick (https://claude.ai/app/main.abc123.js:99:5)',
    '    at handler (moz-extension://uuid/ui.js:10:2?query=x)',
  ].join('\n');

  it('keeps only own-bundle frames and drops host-page frames', () => {
    const frames = scrubFrames(stack);
    expect(frames.some((f) => f.startsWith('content.js'))).toBe(true);
    expect(frames.some((f) => f.startsWith('ui.js'))).toBe(true);
    // No host-page frame survives, and no frame is a full URL.
    expect(frames.some((f) => f.includes('claude.ai'))).toBe(false);
    for (const f of frames) expect(f).not.toContain('://');
  });

  it('scrubException returns content-free parts', () => {
    const out = scrubException({
      name: 'TypeError',
      message: 'leak https://claude.ai/x',
      stack,
    });
    expect(out.type).toBe('TypeError');
    expect(out.message).toContain(MASK);
    expect(out.message).not.toContain('claude.ai');
    expect(out.frames.every((f) => !f.includes('://'))).toBe(true);
  });
});
