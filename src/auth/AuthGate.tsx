import { type ReactNode, useCallback, useMemo, useState } from "react";
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import type { Repository } from "../data/repository";
import { DexieRepository } from "../data/dexie/dexieRepository";
import { ApiRepository } from "../data/api/apiRepository";
import { RepositoryProvider } from "../react/RepositoryContext";
import { API_BASE } from "./passwordlessConfig";
import { isGuest as readGuest, setGuestMode } from "./guestMode";
import { LoginScreen } from "./LoginScreen";

/**
 * The auth guard (spec-auth §2). The app tree only mounts with a valid session or an
 * explicit guest choice, and selects the Repository by session state:
 *   - signed in  → ApiRepository (remote, JWT-scoped)
 *   - guest      → DexieRepository (this device only)
 * Silent token refresh on load is handled by PasswordlessContextProvider; while it runs
 * we show a splash rather than bouncing the user to sign-in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { signInStatus, signOut } = usePasswordless();
  const [guest, setGuest] = useState(readGuest());

  const getIdToken = useCallback(async () => {
    const tokens = await retrieveTokens();
    if (!tokens?.idToken) throw new Error("Not signed in");
    return tokens.idToken;
  }, []);

  const signedIn = signInStatus === "SIGNED_IN";

  const repo = useMemo<Repository | null>(() => {
    if (signedIn) return new ApiRepository({ apiBase: API_BASE, getIdToken });
    if (guest) return new DexieRepository();
    return null;
  }, [signedIn, guest, getIdToken]);

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
