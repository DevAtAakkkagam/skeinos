// On-the-wire envelope. Request/response and broadcast traffic share the same
// `onMessage` channel on extension pages, so each message is tagged to keep the
// two streams from colliding: the hub only dispatches `request` frames, and a
// broadcast subscriber only fires on `broadcast` frames.

import type { Broadcast, RequestBase } from '../../shared/messages';

export const REQUEST_TAG = 'sk.msg.request' as const;
export const BROADCAST_TAG = 'sk.msg.broadcast' as const;

export interface RequestWire {
  tag: typeof REQUEST_TAG;
  payload: RequestBase;
}

export interface BroadcastWire {
  tag: typeof BROADCAST_TAG;
  payload: Broadcast;
}

export function requestWire(payload: RequestBase): RequestWire {
  return { tag: REQUEST_TAG, payload };
}

export function broadcastWire(payload: Broadcast): BroadcastWire {
  return { tag: BROADCAST_TAG, payload };
}

export function isRequestWire(message: unknown): message is RequestWire {
  return isTagged(message, REQUEST_TAG);
}

export function isBroadcastWire(message: unknown): message is BroadcastWire {
  return isTagged(message, BROADCAST_TAG);
}

function isTagged(message: unknown, tag: string): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { tag?: unknown }).tag === tag &&
    'payload' in message
  );
}
