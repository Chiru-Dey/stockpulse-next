"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/api-client";

export type AsyncData<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** For event handlers (buttons, form submits) — shows the spinner again. */
  reload: () => Promise<void>;
  /** For event handlers that invalidate the data locally (e.g. sign out). */
  clear: () => void;
};

/**
 * Loads async data on mount and whenever `loader` changes identity.
 *
 * Contract: pass a stable loader (wrap it in `useCallback`). Filter-driven
 * pages should include their filters in that callback's dependency array so
 * a filter change triggers exactly one refetch.
 *
 * No setState runs before the first `await`: `loading` starts true from
 * useState, and refresh spinners are set by the calling event handler.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  options?: { clearOnError?: boolean },
): AsyncData<T> {
  const clearOnError = options?.clearOnError ?? false;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    try {
      const result = await loader();
      setData(result);
      setError(null);
    } catch (caught) {
      if (clearOnError) setData(null);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loader, clearOnError]);

  useEffect(() => {
    // Every setState in `run` happens after `await`, so it resumes in a
    // microtask once the effect body has returned. The plugin bundled with
    // eslint-config-next still flags this shape — a confirmed upstream false
    // positive (react/react#34905), fixed by react/react#36734. Remove this
    // suppression once eslint-plugin-react-hooks ships that fix.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
  }, [run]);

  const reload = useCallback(async () => {
    setLoading(true);
    await run();
  }, [run]);

  const clear = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, error, loading, reload, clear };
}