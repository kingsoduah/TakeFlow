"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

// Runs an async loader when its inputs change. Old data stays on screen
// while new data loads, so filters and polling never flash empty.
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps) + ":" + tick;
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown }>({ key: null });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    let alive = true;
    fnRef.current().then(
      (data) => {
        if (alive) setState({ key, data });
      },
      (error: unknown) => {
        if (alive) setState((s) => ({ key, data: s.data, error }));
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater: (prev: T | undefined) => T) => setState((s) => ({ ...s, data: updater(s.data) })), []);
  return {
    data: state.data,
    error: state.key === key ? state.error : undefined,
    loading: state.key !== key,
    firstLoad: state.key === null,
    reload,
    setData,
  };
}

// Calls `callback` every `ms` milliseconds while `ms` is not null.
export function useInterval(callback: () => void, ms: number | null) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  });
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// The current time, refreshed every `ms`. Zero until the first tick so the
// server and the browser render the same thing.
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [ms]);
  return now;
}

export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    const first = setTimeout(update, 0);
    mq.addEventListener("change", update);
    return () => {
      clearTimeout(first);
      mq.removeEventListener("change", update);
    };
  }, []);
  return reduce;
}

// Width and height of an element, kept up to date.
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize((s) => (Math.round(r.width) === s.width && Math.round(r.height) === s.height ? s : { width: Math.round(r.width), height: Math.round(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
