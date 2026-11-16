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
  isHydrated: boolean;
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

export function FavoritesProvider({
  initialFavoriteIds,
  children,
}: FavoritesProviderProps) {
  const [committedIds, setCommittedIds] = useState<number[]>(initialFavoriteIds);
  const [isHydrated, setIsHydrated] = useState<boolean>(initialFavoriteIds.length > 0);
  const [toastError, setToastError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const desiredMapRef = useRef<Map<number, boolean>>(new Map());
  const seqMapRef = useRef<Map<number, number>>(new Map());
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    fetch('/api/favorites', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ favoriteIds: number[] }>) : null))
      .then((data) => {
        if (active && data && Array.isArray(data.favoriteIds)) {
          if (desiredMapRef.current.size === 0) {
            setCommittedIds(data.favoriteIds);
          }
          setIsHydrated(true);
        }
      })
      .catch(() => {
        if (active) {
          setIsHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

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

  const isFavorite = useCallback(
    (eventId: number): boolean => optimisticIds.includes(eventId),
    [optimisticIds],
  );

  const toggleFavorite = useCallback(
    (eventId: number): void => {
      setIsHydrated(true);
      const currentDesired =
        desiredMapRef.current.get(eventId) ?? committedIds.includes(eventId);
      const nextDesired = !currentDesired;
      desiredMapRef.current.set(eventId, nextDesired);

      const nextSeq = (seqMapRef.current.get(eventId) ?? 0) + 1;
      seqMapRef.current.set(eventId, nextSeq);

      setToastError(null);

      startTransition(async () => {
        applyOptimistic({ eventId, isFavorite: nextDesired });

        const task = writeQueueRef.current.then(async () => {
          if (seqMapRef.current.get(eventId) !== nextSeq) {
            return;
          }

          const targetState = desiredMapRef.current.get(eventId) ?? nextDesired;
          const result = await setFavoriteAction({
            eventId,
            isFavorite: targetState,
          });

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
        isHydrated,
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
