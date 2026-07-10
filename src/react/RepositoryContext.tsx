import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Repository } from "../data/repository";
import type { User } from "../domain/types";
import { DexieRepository } from "../data/dexie/dexieRepository";

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

  const reloadUser = async () => {
    const u = await repository.getCurrentUser();
    setUser(u);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const u = await repository.getCurrentUser();
      if (active) {
        setUser(u);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [repository]);

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
