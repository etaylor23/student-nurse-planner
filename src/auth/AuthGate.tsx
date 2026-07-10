import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import type { Repository } from "../data/repository";
import { DexieRepository } from "../data/dexie/dexieRepository";
import { PlannerDb } from "../data/dexie/db";
import { SyncRepository } from "../data/sync/syncRepository";
import { RpcSyncTransport } from "../data/sync/rpcSyncTransport";
import { RepositoryProvider } from "../react/RepositoryContext";
import { API_BASE } from "./passwordlessConfig";
import { isGuest as readGuest, setGuestMode } from "./guestMode";
import { LoginScreen } from "./LoginScreen";

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

  const logout = useCallback(async () => {
    try {
      await signOut().signedOut;
    } catch {
      /* ignore — clearing local state below is what matters */
    }
    setGuestMode(false);
    setGuest(false);
  }, [signOut]);

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

  return (
    <RepositoryProvider repo={repo} logout={logout} isGuest={!signedIn}>
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
