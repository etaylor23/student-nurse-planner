import { type FormEvent, useState } from "react";
import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import { btnGhost, btnPrimary, card, inputCls } from "../react/components/ui";

/**
 * The logged-out screen (spec-auth §2.1, §2.4) — a first-class page, not an error.
 * Requests a magic link and always shows a NON-ENUMERATING confirmation (§1.5), so an
 * unknown address is indistinguishable from a known one. Redemption of an inbound link
 * is automatic (handled by PasswordlessContextProvider); this screen just reflects the
 * signingInStatus while that happens.
 */
export function LoginScreen({ onContinueAsGuest }: { onContinueAsGuest: () => void }) {
  const { requestSignInLink, signingInStatus, signInStatus } = usePasswordless();
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);

  const redeeming =
    signInStatus === "SIGNING_IN" ||
    signingInStatus === "SIGNING_IN_WITH_LINK" ||
    signingInStatus === "CHECKING_FOR_SIGNIN_LINK";
  const linkError =
    signingInStatus === "SIGNIN_LINK_EXPIRED" || signingInStatus === "INVALID_SIGNIN_LINK";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const username = email.trim();
    if (!username) return;
    // Fire the request; swallow the outcome so a known vs unknown address can't be told
    // apart. `abort` is ignored — one-shot request.
    const { signInLinkRequested } = requestSignInLink({ username });
    signInLinkRequested.catch(() => {
      /* non-enumerating: never surface whether the address exists */
    });
    setRequested(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className={`${card} w-full max-w-md`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
          Student Nurse Planner
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Sign in</h1>

        {redeeming ? (
          <p className="mt-4 text-sm text-slate-600">Signing you in…</p>
        ) : requested ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">
              If that address has an account, a link is on its way. Check your email and open the
              link on this device.
            </p>
            <button type="button" className={btnGhost} onClick={() => setRequested(false)}>
              Use a different email
            </button>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <p className="text-sm text-slate-500">
              We'll email you a secure sign-in link — no password needed.
            </p>
            <div>
              <label htmlFor="email" className="text-xs font-medium text-slate-600">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`${inputCls} mt-1`}
              />
            </div>
            {linkError && (
              <p className="text-sm text-amber-600">
                That link has expired or was already used — request a new one.
              </p>
            )}
            <button type="submit" className={`${btnPrimary} w-full`}>
              Email me a link
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-slate-100 pt-4">
          <button type="button" className={`${btnGhost} w-full`} onClick={onContinueAsGuest}>
            Continue on this device only
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            Guest mode keeps everything on this device. You can load demo data to explore.
          </p>
        </div>
      </div>
    </div>
  );
}
