import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, errorMessage } from './api.ts';

// Debounced saving for anything the player edits: notebook entries, a
// mission's working state, later Training Grounds drafts.
//
// The status only says "saved" once the server has confirmed it. Each save
// carries the version it was based on; if another device saved first the
// server refuses with 409 and the newer copy, and this hook stops and reports
// a conflict instead of overwriting -- the caller decides what to keep.

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

interface Options<T, R> {
  /** performs the save; resolves with the server's reply */
  save: (value: T) => Promise<R>;
  /** pulls the newer copy out of a 409 body */
  readConflict: (body: Record<string, unknown>) => unknown;
  delayMs?: number;
}

export function useAutosave<T, R>({ save, readConflict, delayMs = 1200 }: Options<T, R>) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<unknown>(null);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<R | undefined> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return undefined;
    setStatus('saving');
    try {
      const reply = await saveRef.current(value);
      // only clear if nothing newer was typed while this was in flight
      if (pending.current === value) {
        pending.current = null;
        setStatus('saved');
      } else {
        setStatus('dirty');
      }
      setError(null);
      return reply;
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'conflict') {
        setConflict(readConflict(err.body));
        setStatus('conflict');
      } else {
        setError(errorMessage(err));
        setStatus('error');
      }
      return undefined;
    }
  }, [readConflict]);

  const change = useCallback((value: T) => {
    pending.current = value;
    setStatus('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  }, [delayMs, flush]);

  const resolve = useCallback(() => {
    setConflict(null);
    setStatus(pending.current === null ? 'saved' : 'dirty');
  }, []);

  // warn before closing the tab with unsaved work
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current !== null) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { status, error, conflict, change, flush, resolve, hasPending: () => pending.current !== null };
}

export const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Changed elsewhere',
};
