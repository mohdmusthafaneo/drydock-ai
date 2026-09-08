/**
 * Tiny external store — no Redux, no deps.
 * Compatible with React `useSyncExternalStore`.
 */

export type Store<S> = {
  get: () => S;
  set: (next: S | ((prev: S) => S)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<S>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (next) => {
      const value =
        typeof next === "function" ? (next as (prev: S) => S)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
