'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { AlertCircle, X } from 'lucide-react';
import { setFavoriteAction } from '@/app/actions/favorites';

interface FavoritesContextValue {
  favoriteIds: number[];
  favoritesCount: number;
  isFavorite: (eventId: number) => boolean;
  toggleFavorite: (eventId: number) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

interface OptimisticMutation {
  eventId: number;
  isFavorite: boolean;
}

export interface FavoritesProviderProps {
  initialFavoriteIds: number[];
  children: ReactNode;
}

/**
 * Global Favorites Provider powered by React 19 `useOptimistic`.
 *
 * Race-condition protection for rapid consecutive clicks (e.g. 5 fast clicks):
 * 1. A synchronous `desiredMapRef` tracks the latest target boolean per `eventId`
 *    at the exact instant of each click, even before any transition completes.
 * 2. Only the latest target state is sent in a serialized promise queue so earlier
 *    in-flight clicks can never overwrite a newer click in the HTTP-only cookie.
 * 3. If the Server Action fails, `committedIds` remains untouched so `useOptimistic`
 *    automatically rolls back the UI and displays an error toast.
 */
export function FavoritesProvider({
  initialFavoriteIds,
  children,
}: FavoritesProviderProps) {
  const [committedIds, setCommittedIds] = useState<number[]>(initialFavoriteIds);
  const [toastError, setToastError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Sync if server re-renders with updated cookie values
  useEffect(() => {
    setCommittedIds(initialFavoriteIds);
  }, [initialFavoriteIds]);

  const [optimisticIds, applyOptimistic] = useOptimistic<
    number[],
    OptimisticMutation
  >(committedIds, (state, { eventId, isFavorite }) => {
    const next = new Set(state);
    if (isFavorite) {
      next.add(eventId);
    } else {
      next.delete(eventId);
    }
    return [...next];
  });

  // Tracks the latest user-intended boolean per eventId across rapid synchronous clicks
  const desiredMapRef = useRef<Map<number, boolean>>(new Map());
  // Monotonic sequence per eventId to coalesce rapid clicks so only the final state commits
  const seqMapRef = useRef<Map<number, number>>(new Map());
  // Serializes cookie writes so concurrent Server Actions never race each other on Set-Cookie
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const isFavorite = useCallback(
    (eventId: number): boolean => optimisticIds.includes(eventId),
    [optimisticIds],
  );

  const toggleFavorite = useCallback(
    (eventId: number): void => {
      const currentDesired =
        desiredMapRef.current.get(eventId) ?? committedIds.includes(eventId);
      const nextDesired = !currentDesired;
      desiredMapRef.current.set(eventId, nextDesired);

      const nextSeq = (seqMapRef.current.get(eventId) ?? 0) + 1;
      seqMapRef.current.set(eventId, nextSeq);

      setToastError(null);

      startTransition(async () => {
        // 1. Apply instant optimistic UI update (updates both card heart & Header badge)
        applyOptimistic({ eventId, isFavorite: nextDesired });

        // 2. Enqueue the server cookie mutation in strict order
        const task = writeQueueRef.current.then(async () => {
          // If a newer click on the same event already happened, skip intermediate network call
          if (seqMapRef.current.get(eventId) !== nextSeq) {
            return;
          }

          const targetState = desiredMapRef.current.get(eventId) ?? nextDesired;
          const result = await setFavoriteAction({
            eventId,
            isFavorite: targetState,
          });

          // Only apply the server response if no newer click superseded this one
          if (seqMapRef.current.get(eventId) === nextSeq) {
            desiredMapRef.current.delete(eventId);
            if (result.ok) {
              setCommittedIds(result.favoriteIds);
            } else {
              setToastError(result.error);
            }
          }
        });

        writeQueueRef.current = task.catch(() => {
          desiredMapRef.current.delete(eventId);
          setToastError('Network error while saving favorite. Rolled back.');
        });

        await writeQueueRef.current;
      });
    },
    [applyOptimistic, committedIds],
  );

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds: optimisticIds,
        favoritesCount: optimisticIds.length,
        isFavorite,
        toggleFavorite,
      }}
    >
      {children}

      {toastError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-md"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span className="flex-1">{toastError}</span>
          <button
            type="button"
            onClick={() => setToastError(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within a <FavoritesProvider>');
  }
  return ctx;
}
