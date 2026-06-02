// The Zag.js ↔ Preact bridge — the one place the interaction layer adapts Zag's
// framework-agnostic state machines to Preact (decision D-IP3). Zag ships official
// adapters for React/Vue/Solid/Svelte but not Preact, so `useMachine` here is a
// faithful port of `@zag-js/react`'s adapter (v1.41) onto `preact/hooks`, with two
// substitutions:
//
//  1. React hooks → `preact/hooks` (signature-compatible).
//  2. `react-dom`'s `flushSync` → a plain call. Preact batches state updates and
//     flushes them in a microtask; every consumer reads machine state on the next
//     render and our tests poll with `waitFor`, so a synchronous flush is not
//     required for correctness — and it lets us avoid pulling in `preact/compat`
//     (the React-shim we explicitly rejected in design D-IP1).
//
// Nothing outside `ui/primitives/` imports `@zag-js/*` directly; widgets consume
// `useMachine` + a machine's `connect` through this module.

import { options } from 'preact';
import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createScope,
  findTransition,
  getExitEnterStates,
  hasTag,
  INIT_STATE,
  MachineStatus,
  matchesState,
  mergeProps,
  resolveStateValue,
  type Machine,
  type MachineSchema,
  type Service,
} from '@zag-js/core';
import { createNormalizer } from '@zag-js/types';
import { callAll, compact, ensure, isFunction, isString, toArray, warn } from '@zag-js/utils';

/* eslint-disable @typescript-eslint/no-explicit-any -- generic state-machine glue */

// Preact 10 accepts React-style prop names (className, htmlFor, onClick, object
// `style`), so Zag's identity normalizer works unchanged — same as the React
// adapter, which is also `createNormalizer((v) => v)`.
export const normalizeProps = createNormalizer((v: any) => v);

export { mergeProps };

// `react-dom.flushSync` replacement. Zag marks some context values `sync` and the
// machine flushes the state value synchronously so the next queued event reads fresh
// state (e.g. rapid arrow-key navigation). We reproduce a real synchronous flush the
// way `preact/compat` does — by momentarily making Preact's render scheduler run its
// callback immediately — without importing the compat shim (design D-IP1).
const flushSync = (fn: () => void) => {
  const prev = options.debounceRendering;
  options.debounceRendering = (cb: () => void) => cb();
  try {
    fn();
  } finally {
    options.debounceRendering = prev;
  }
};

const useSafeLayoutEffect = typeof globalThis.document !== 'undefined' ? useLayoutEffect : useEffect;

function useLiveRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useProp<T extends Record<string, any>>(value: T) {
  const ref = useLiveRef(value);
  return function get<K extends keyof T>(key: K): T[K] {
    return ref.current[key];
  };
}

// Ported from `@zag-js/react`'s `useBindable`. Backs every reactive slot a machine
// declares (context values, the state value) with a Preact `useState` cell.
function useBindable(props: () => any): any {
  const initial = props().value ?? props().defaultValue;
  const eq = props().isEqual ?? Object.is;
  const [initialValue] = useState(initial);
  const [value, setValue] = useState(initialValue);
  const controlled = props().value !== undefined;
  const valueRef = useRef(value);
  valueRef.current = controlled ? props().value : value;
  const prevValue = useRef(valueRef.current);

  useSafeLayoutEffect(() => {
    prevValue.current = valueRef.current;
  }, [value, props().value]);

  const setFn = (next: any) => {
    const prev = prevValue.current;
    const resolved = isFunction(next) ? next(prev) : next;
    if (!controlled) setValue(resolved);
    if (!eq(resolved, prev)) props().onChange?.(resolved, prev);
  };

  return {
    initial: initialValue,
    ref: valueRef,
    get() {
      return controlled ? props().value : value;
    },
    set(next: any) {
      const exec = props().sync ? flushSync : (fn: () => void) => fn();
      exec(() => setFn(next));
    },
    invoke(nextValue: any, previous: any) {
      props().onChange?.(nextValue, previous);
    },
    hash(v: any) {
      return props().hash?.(v) ?? String(v);
    },
  };
}
// `cleanup`/`ref` are zag-js bindable helpers namespaced on `useBindable`; they
// call hooks but aren't named like components/custom hooks, so rules-of-hooks
// (and the intentional mount-only deps) don't apply.
/* eslint-disable react-hooks/rules-of-hooks, react-hooks/exhaustive-deps */
useBindable.cleanup = (fn: () => void) => {
  useEffect(() => fn, []);
};
useBindable.ref = (defaultValue: any) => {
  const value = useRef(defaultValue);
  return {
    get: () => value.current,
    set: (next: any) => {
      value.current = next;
    },
  };
};
/* eslint-enable react-hooks/rules-of-hooks, react-hooks/exhaustive-deps */

function useRefs(refs: any) {
  const ref = useRef(refs);
  return {
    get(key: any) {
      return ref.current[key];
    },
    set(key: any, value: any) {
      ref.current[key] = value;
    },
  };
}

// Ported from `@zag-js/react`'s `useTrack`: runs `effect` when tracked deps change
// after the first render. Machines pass this to `track` in their watch hooks.
function useTrack(deps: any[], effect: () => void) {
  const render = useRef(false);
  const called = useRef(false);
  useEffect(() => {
    const mounted = render.current;
    const run = mounted && called.current;
    if (run) return effect();
    called.current = true;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...(deps ?? []).map((d) => (typeof d === 'function' ? d() : d))]);
  useEffect(() => {
    render.current = true;
    return () => {
      render.current = false;
    };
  }, []);
}

/**
 * Instantiate and run a Zag.js machine, returning the `Service` its `connect`
 * consumes. Pass `getRootNode: () => shadowRoot` so the machine queries elements
 * and attaches dismiss/focus listeners inside our shadow root (decision D-IP4).
 */
export function useMachine<T extends MachineSchema>(
  machine: Machine<T>,
  userProps: Partial<any> = {},
): Service<T> {
  const scope = useMemo(() => {
    const { id, ids, getRootNode } = userProps;
    return createScope({ id, ids, getRootNode });
  }, [userProps]);

  const debug = (...args: any[]) => {
    if ((machine as any).debug) console.log(...args);
  };

  const props = (machine as any).props?.({ props: compact(userProps), scope }) ?? userProps;
  const prop = useProp(props);

  const context = (machine as any).context?.({
    prop,
    bindable: useBindable,
    scope,
    flush,
    getContext: () => ctx,
    getComputed: () => computed,
    getRefs: () => refs,
    getEvent: () => getEvent(),
  });
  const contextRef = useLiveRef(context);

  const ctx = {
    get(key: any) {
      return contextRef.current?.[key].ref.current;
    },
    set(key: any, value: any) {
      contextRef.current?.[key].set(value);
    },
    initial(key: any) {
      return contextRef.current?.[key].initial;
    },
    hash(key: any) {
      const current = contextRef.current?.[key].get();
      return contextRef.current?.[key].hash(current);
    },
  };

  const effects = useRef<Map<string, any>>(new Map());
  const transitionRef = useRef<any>(null);
  const previousEventRef = useRef<any>(null);
  const eventRef = useRef<any>({ type: '' });

  const getEvent = () => ({
    ...eventRef.current,
    current: () => eventRef.current,
    previous: () => previousEventRef.current,
  });

  const getState = () => ({
    ...state,
    matches(...values: any[]) {
      return values.some((value) => matchesState(state.ref.current, value));
    },
    hasTag(tag: any) {
      return hasTag(machine, state.ref.current, tag);
    },
  });

  const refs = useRefs((machine as any).refs?.({ prop, context: ctx }) ?? {});

  const getParams = () => ({
    state: getState(),
    context: ctx,
    event: getEvent(),
    prop,
    send,
    action,
    guard,
    track: useTrack,
    refs,
    computed,
    flush,
    scope,
    choose,
  });

  const action = (keys: any) => {
    const strs = isFunction(keys) ? keys(getParams()) : keys;
    if (!strs) return;
    const fns = strs.map((s: any) => {
      const fn = (machine as any).implementations?.actions?.[s];
      if (!fn) warn(`[zag-js] No implementation found for action "${JSON.stringify(s)}"`);
      return fn;
    });
    for (const fn of fns) fn?.(getParams());
  };

  const guard = (str: any) => {
    if (isFunction(str)) return str(getParams());
    const fn = (machine as any).implementations?.guards?.[str];
    if (!fn) warn(`[zag-js] No implementation found for guard "${JSON.stringify(str)}"`);
    return fn?.(getParams());
  };

  const effect = (keys: any) => {
    const strs = isFunction(keys) ? keys(getParams()) : keys;
    if (!strs) return undefined;
    const fns = strs.map((s: any) => {
      const fn = (machine as any).implementations?.effects?.[s];
      if (!fn) warn(`[zag-js] No implementation found for effect "${JSON.stringify(s)}"`);
      return fn;
    });
    const cleanups: any[] = [];
    for (const fn of fns) {
      const cleanup = fn?.(getParams());
      if (cleanup) cleanups.push(cleanup);
    }
    return () => cleanups.forEach((fn) => fn?.());
  };

  const choose = (transitions: any) =>
    toArray(transitions).find((t: any) => {
      let result = !t.guard;
      if (isString(t.guard)) result = !!guard(t.guard);
      else if (isFunction(t.guard)) result = t.guard(getParams());
      return result;
    });

  const computed = (key: any) => {
    ensure((machine as any).computed, () => `[zag-js] No computed object found on machine`);
    const fn = (machine as any).computed[key];
    return fn({ context: ctx, event: getEvent(), prop, refs, scope, computed });
  };

  const state = useBindable(() => ({
    defaultValue: resolveStateValue(machine, (machine as any).initialState({ prop })),
    onChange(nextState: any, prevState: any) {
      const { exiting, entering } = getExitEnterStates(
        machine,
        prevState,
        nextState,
        transitionRef.current?.reenter,
      );
      exiting.forEach((item: any) => {
        const exitEffects = effects.current.get(item.path);
        exitEffects?.();
        effects.current.delete(item.path);
      });
      exiting.forEach((item: any) => action(item.state?.exit));
      action(transitionRef.current?.actions);
      entering.forEach((item: any) => {
        const cleanup = effect(item.state?.effects);
        if (cleanup) {
          const existing = effects.current.get(item.path);
          effects.current.set(item.path, existing ? callAll(existing, cleanup) : cleanup);
        }
      });
      if (prevState === INIT_STATE) {
        action((machine as any).entry);
        const cleanup = effect((machine as any).effects);
        if (cleanup) {
          const existing = effects.current.get(INIT_STATE);
          effects.current.set(INIT_STATE, existing ? callAll(existing, cleanup) : cleanup);
        }
      }
      entering.forEach((item: any) => action(item.state?.entry));
    },
  }));

  const hydratedStateRef = useRef<any>(undefined);
  const statusRef = useRef<MachineStatus>(MachineStatus.NotStarted);

  useSafeLayoutEffect(() => {
    queueMicrotask(() => {
      const started = statusRef.current === MachineStatus.Started;
      statusRef.current = MachineStatus.Started;
      debug(started ? 'rehydrating...' : 'initializing...');
      const initialState = hydratedStateRef.current ?? state.initial;
      state.invoke(initialState, started ? state.get() : INIT_STATE);
    });
    const fns = effects.current;
    return () => {
      const currentState = getCurrentState();
      debug('unmounting...');
      hydratedStateRef.current = currentState;
      statusRef.current = MachineStatus.Stopped;
      fns.forEach((fn) => fn?.());
      effects.current = new Map();
      transitionRef.current = null;
      queueMicrotask(() => {
        action((machine as any).exit);
        statusRef.current = MachineStatus.Stopped;
      });
    };
  }, []);

  const getCurrentState = () => ('ref' in state ? state.ref.current : state.get());

  const send = (event: any) => {
    queueMicrotask(() => {
      if (statusRef.current !== MachineStatus.Started) return;
      previousEventRef.current = eventRef.current;
      eventRef.current = event;
      const currentState = getCurrentState();
      const { transitions, source } = findTransition(machine, currentState, event.type);
      const transition = choose(transitions);
      if (!transition) return;
      transitionRef.current = transition;
      const target = resolveStateValue(machine, transition.target ?? currentState, source);
      debug('transition', event.type, transition.target || currentState, `(${transition.actions})`);
      const changed = target !== currentState;
      if (changed) {
        flushSync(() => state.set(target));
      } else if (transition.reenter) {
        state.invoke(currentState, currentState);
      } else {
        action(transition.actions ?? []);
      }
    });
  };

  (machine as any).watch?.(getParams());

  return {
    state: getState(),
    send,
    context: ctx,
    prop,
    scope,
    refs,
    computed,
    event: getEvent(),
    getStatus: () => statusRef.current,
  } as unknown as Service<T>;
}

function flush(fn: () => void) {
  queueMicrotask(() => {
    flushSync(() => fn());
  });
}
