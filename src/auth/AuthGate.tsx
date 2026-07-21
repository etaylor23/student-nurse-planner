import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Dexie from "dexie";
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import type { Repository } from "../data/repository";
import { DexieRepository, LOCAL_USER_ID } from "../data/dexie/dexieRepository";
import { PlannerDb } from "../data/dexie/db";
import { SyncRepository } from "../data/sync/syncRepository";
import { RpcSyncTransport } from "../data/sync/rpcSyncTransport";
import { RepositoryProvider } from "../react/RepositoryContext";
import { clearReflectionPin } from "../react/reflectionLock";
import { API_BASE } from "./passwordlessConfig";
import { isGuest as readGuest, setGuestMode } from "./guestMode";
import { LoginScreen } from "./LoginScreen";

/**
 * Local self-destruct for a shared machine: delete this user's Dexie database and every
 * device-local key, so nothing readable (reflections, PIN, in-progress drafts) is left in
 * the browser profile after sign-out. Anything already synced re-appears on next sign-in;
 * only unsynced local-only state is lost (the caller warns first if the outbox is non-empty).
 */
async function wipeLocalUserData(sub: string): Promise<void> {
  await Dexie.delete(`nurse-planner-${sub}`);
  clearReflectionPin();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("pm:draft:")) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * The auth guard (spec-auth §2). The app tree only mounts with a valid session or an
 * explicit guest choice, and selects the Repository by session state:
 *   - signed in  → SyncRepository (local-first: local Dexie half + a background reconciler
 *                  against the remote — offline-capable; spec-backend-dynamodb.md §5)
 *   - guest      → DexieRepository (this device only)
 * Silent token refresh on load is handled by PasswordlessContextProvider; while it runs
 * we show a splash rather than bouncing the user to sign-in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { signInStatus, signOut, tokensParsed } = usePasswordless();
  const [guest, setGuest] = useState(readGuest());

  const getIdToken = useCallback(async () => {
    const tokens = await retrieveTokens();
    if (!tokens?.idToken) throw new Error("Not signed in");
    return tokens.idToken;
  }, []);

  const signedIn = signInStatus === "SIGNED_IN";
  // The Cognito `sub` — namespaces the local Dexie DB per user so a shared device (or the
  // guest store) never collides, and keys the local half to match the server partition.
  const sub = typeof tokensParsed?.idToken?.sub === "string" ? tokensParsed.idToken.sub : undefined;

  const repo = useMemo<Repository | null>(() => {
    if (signedIn && sub) {
      return new SyncRepository({
        db: new PlannerDb(`nurse-planner-${sub}`),
        userId: sub,
        transport: new RpcSyncTransport({ apiBase: API_BASE, getIdToken }),
      });
    }
    if (guest) return new DexieRepository();
    return null;
  }, [signedIn, sub, guest, getIdToken]);

  // Tear down the sync layer's timers/listeners when the repo changes or the gate unmounts.
  useEffect(() => {
    return () => {
      if (repo instanceof SyncRepository) repo.dispose();
    };
  }, [repo]);

  const logout = useCallback(
    async (opts?: { wipeLocal?: boolean }) => {
      // Local self-destruct BEFORE clearing tokens: we need the sub to name the DB, and a
      // half-signed-out state must not strand it. Only for a signed-in user on their own sub.
      if (opts?.wipeLocal && signedIn && sub) {
        if (repo instanceof SyncRepository) repo.dispose();
        await wipeLocalUserData(sub);
      }
      try {
        await signOut().signedOut;
      } catch {
        /* ignore — clearing local state below is what matters */
      }
      setGuestMode(false);
      setGuest(false);
    },
    [signOut, signedIn, sub, repo],
  );

  const enterGuest = useCallback(() => {
    setGuestMode(true);
    setGuest(true);
  }, []);

  // Silent-renew / initial token check in flight — don't flash the login screen.
  if (signInStatus === "CHECKING" || signInStatus === "REFRESHING_SIGN_IN") {
    return <Splash />;
  }

  if (!repo) {
    return <LoginScreen onContinueAsGuest={enterGuest} />;
  }

  // The current-user id, known synchronously (unlike the async-loaded user record): the
  // Cognito sub when signed in, else the local guest id. Keys per-user device-local state.
  const userId = signedIn && sub ? sub : LOCAL_USER_ID;

  return (
    <RepositoryProvider repo={repo} logout={logout} isGuest={!signedIn} userId={userId}>
      {children}
    </RepositoryProvider>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-500">Loading…</p>
    </div>
  );
}
