/**
 * Custom create-auth-challenge entry — brands the magic-link email.
 *
 * The passwordless construct's default sends a bare, unstyled "Your secret sign-in link"
 * from a name-less address — the beta's first product touchpoint, and it reads like a
 * phishing test. We override ONLY the email content + From display name by calling the
 * library's `magicLink.configure(...)`, then re-export its handler unchanged (dispatch,
 * signing, single-use enforcement, expiry — all still the library's). Wired via
 * `functionProps.createAuthChallenge.entry` in constructs/auth.ts; every environment
 * variable the library needs is still injected by the construct.
 */
import { createAuthChallengeHandler, magicLink } from "amazon-cognito-passwordless-auth/custom-auth";

const EXPIRY_SECONDS = Math.max(60, Number(process.env.SECONDS_UNTIL_EXPIRY || 900));

/** Human-friendly expiry for the email copy (e.g. "7 days", "2 hours", "15 minutes"). The link
 *  window is configurable (magicLink.secondsUntilExpiry in constructs/auth.ts), so we render the
 *  right unit rather than hard-coding "minutes" (which reads as "10080 minutes" at 7 days). */
function expiryLabel(seconds: number): string {
  const DAY = 86400,
    HOUR = 3600,
    MIN = 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (seconds >= DAY) return unit(Math.round(seconds / DAY), "day");
  if (seconds >= HOUR) return unit(Math.round(seconds / HOUR), "hour");
  return unit(Math.max(1, Math.round(seconds / MIN)), "minute");
}
const EXPIRY_LABEL = expiryLabel(EXPIRY_SECONDS);

// Keep the verified address from config.ts (SES_FROM_ADDRESS) as the envelope sender; add a
// display name so inboxes show "PlaceMate", not a bare address. Domain (DKIM/DMARC) unchanged.
const fromAddress = process.env.SES_FROM_ADDRESS;
const brandedFrom = fromAddress ? `PlaceMate <${fromAddress}>` : undefined;

const brandColor = "#059669"; // emerald — brand primary
const ink = "#0f172a";
const muted = "#64748b";

function html(secretLoginLink: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
<tr><td style="padding:28px 32px 8px;">
<span style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${ink};">place<span style="color:${brandColor};">mate</span></span>
</td></tr>
<tr><td style="padding:8px 32px 4px;">
<h1 style="margin:0;font-size:20px;font-weight:600;color:${ink};">Your sign-in link</h1>
<p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:${muted};">Tap the button below to sign in to PlaceMate. It works once and expires in ${EXPIRY_LABEL}, and must be opened on the device that requested it.</p>
</td></tr>
<tr><td style="padding:24px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:${brandColor};">
<a href="${secretLoginLink}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">Sign in to PlaceMate</a>
</td></tr></table>
<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${muted};">Or paste this link into your browser:<br><a href="${secretLoginLink}" style="color:${brandColor};word-break:break-all;">${secretLoginLink}</a></p>
</td></tr>
<tr><td style="padding:8px 32px 28px;border-top:1px solid #f1f5f9;">
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">Didn't request this? You can safely ignore this email. Need a hand? Just reply, or email <a href="mailto:hello@placemate.uk" style="color:${muted};">hello@placemate.uk</a>.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function text(secretLoginLink: string): string {
  return [
    "Your PlaceMate sign-in link",
    "",
    "Open this link to sign in. It works once and expires in " + EXPIRY_LABEL + ",",
    "and must be opened on the device that requested it:",
    "",
    secretLoginLink,
    "",
    "Didn't request this? You can safely ignore this email.",
    "Need a hand? Email hello@placemate.uk.",
  ].join("\n");
}

magicLink.configure({
  ...(brandedFrom ? { sesFromAddress: brandedFrom } : {}),
  contentCreator: async ({ secretLoginLink }: { secretLoginLink: string }) => ({
    subject: { data: "Your PlaceMate sign-in link", charSet: "UTF-8" },
    html: { data: html(secretLoginLink), charSet: "UTF-8" },
    text: { data: text(secretLoginLink), charSet: "UTF-8" },
  }),
});

export const handler = createAuthChallengeHandler;
