import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/react";
import type { Repository } from "../data/repository";
import type { User } from "../domain/types";
import { DexieRepository } from "../data/dexie/dexieRepository";
import { StorageBlockedScreen } from "./components/AppError";

interface RepositoryContextValue {
  repo: Repository;
  user: User | null;
  loading: boolean;
  reloadUser: () => Promise<void>;
  /** Sign out (or leave guest mode) and return to the login screen. */
  logout: () => Promise<void>;
  /** True in guest ("this device only") mode — used to gate account-only affordances. */
  isGuest: boolean;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

/**
 * Provides a single Repository instance and the current user to the tree.
 * Defaults to the IndexedDB-backed repository; `AuthGate` injects the session-selected
 * repo (ApiRepository when signed in, Dexie for guests) plus `logout`/`isGuest`. Keeping
 * auth out of feature code: screens call `useRepository().logout()`, never the auth lib.
 */
export function RepositoryProvider({
  children,
  repo,
  logout,
  isGuest = true,
}: {
  children: React.ReactNode;
  repo?: Repository;
  logout?: () => Promise<void>;
  isGuest?: boolean;
}) {
  const repository = useMemo(() => repo ?? new DexieRepository(), [repo]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Fatal: the browser refused to open local storage (private mode / blocked profile).
  // Without capturing it, a rejected initial load left `loading` true forever — an
  // infinite spinner. Now it short-circuits to a clear, recoverable screen.
  const [storageBlocked, setStorageBlocked] = useState(false);

  const reloadUser = async () => {
    try {
      const u = await repository.getCurrentUser();
      setUser(u);
    } catch (err) {
      // The app is already up; a transient reload failure shouldn't tear it down. Log it.
      Sentry.captureException(err);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const u = await repository.getCurrentUser();
        if (active) {
          setUser(u);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          Sentry.captureException(err);
          setLoading(false);
          setStorageBlocked(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [repository]);

  // Bind the current user to Sentry so feedback + errors are attributable.
  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email, username: user.displayName });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  if (storageBlocked) return <StorageBlockedScreen />;

  const value: RepositoryContextValue = {
    repo: repository,
    user,
    loading,
    reloadUser,
    logout: logout ?? (async () => {}),
    isGuest,
  };
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): RepositoryContextValue {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error("useRepository must be used within a RepositoryProvider");
  return ctx;
}
