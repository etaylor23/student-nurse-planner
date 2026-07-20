# Plan — placemate.uk unreachable on NHS (UCLH) hospital WiFi

**Status:** Planned (grilled 2026-07-20) · **Effort:** ~1–2 hrs infra + ongoing vendor submissions · **Priority:** TBD (decide ordering)

## The report

A beta user on **UCLH WiFi** tapped a placemate.uk link (from WhatsApp) and Safari
showed **"Safari can't open the page because the network connection was lost."**
Their words: *"This is what comes up when I click on the website on the uclh WiFi."*

Why this matters disproportionately: our core audience is **student nurses on
placement**, who spend their days on **hospital WiFi**. If NHS networks can't reach
us, the beta is broken for exactly the people and the moments it's meant to serve.

## Decisions (locked in grilling)

- **Scope:** investigate **both** the marketing site (`placemate.uk`) and the app
  (`app.placemate.uk`), **app-priority** — they share domain/TLS/IPv6 fate so likely
  one root cause, but the app is the real placement use-case.
- **Evidence gathering:** **remote checks only** — no burden on the reporter, no UCLH
  IT escalation for now. *Accepted limitation:* remote checks confirm **our** side is
  healthy and get us allow-listed, but can't reproduce the UCLH network, so they may
  not **prove** the hospital-side cause. Ultimate confirmation is a future real-world
  retry.
- **Remediation:** **ship the cheap, reversible hedges now** even without a confirmed
  cause (each targets a known cause of this exact symptom): drop IPv6, drop HSTS
  `preload`, submit for filter re-categorisation.
- **Priority vs the other four tasks:** to be decided.

## Infra facts (from the CDK)

Both distributions ([`marketing-stack.ts`](../infra/lib/marketing-stack.ts),
[`web.ts`](../infra/lib/constructs/web.ts)) share:

- TLS **1.2 (2021)** minimum, `REDIRECT_TO_HTTPS`.
- **HSTS with `preload: true` + `includeSubdomains`**, `max-age` 365d (so apex HSTS
  covers `app.` too).
- **A *and* AAAA** (IPv6) Route 53 alias records → CloudFront.
- `httpVersion` unset → CDK default **HTTP/2 only** (no QUIC/HTTP3).
- App is `X-Robots-Tag: noindex`; the marketing apex is the single indexed/shared entity.

## Hypotheses (ranked)

1. **Broken IPv6 on the hospital WiFi.** AAAA is published; enterprise/guest WiFi with
   half-working IPv6 is a classic cause of `NSURLErrorNetworkConnectionLost (-1005)`
   that **works on cellular but not WiFi**. Top suspect.
2. **TLS interception / SSL inspection** by the NHS proxy presenting a re-signed cert
   the device doesn't trust (BYOD), and/or the handshake being reset — compounded by
   **HSTS** removing any "proceed anyway" escape.
3. **Young / uncategorised-domain web filter** doing a **silent TCP reset** instead of
   returning a visible block page (the "domain is a youngster" angle).
4. Captive portal not completed, or DNS interception/timeouts.
5. WhatsApp in-app browser quirk (the link was opened from WhatsApp).
- **Ruled out:** HTTP/3 / QUIC (not enabled).

## Remote diagnostics to run (and what each can actually tell us)

- **SSL Labs** (`ssllabs.com/ssltest`) — cert chain, trust, TLS versions, handshake health.
- **HSTS preload status** — look up `placemate.uk` on `hstspreload.org` to learn whether
  we're actually preloaded (the header directive alone doesn't preload us).
- **IPv6 reachability** — `dig AAAA placemate.uk` / `app.placemate.uk`, `curl -6 -v https://placemate.uk`,
  confirm CloudFront serves over v6; compare with `curl -4`.
- **Domain age / reputation** — WHOIS age, VirusTotal, urlscan.io.
- **Filter category lookups + re-categorisation forms** — check + request the correct
  category (Health / Education / Reference) with the vendors NHS trusts commonly use:
  Cisco **Talos**, Fortinet **FortiGuard**, Symantec/Broadcom **BlueCoat WebPulse Site
  Review**, **Forcepoint**, **Netstar/Smoothwall**, **Netsweeper**, **Zscaler**, **Palo Alto**.
- **Multi-vantage fetch** — confirm consistent 200s/redirects from external checkers.

> None of these reproduce the UCLH network. They (a) prove our config is clean and
> (b) proactively get the domain allow-listed. Treat as necessary-but-not-sufficient.

## Remediation to ship (unilateral, reversible)

1. **Drop IPv6 for our hostnames.** Remove the `AaaaRecord`s in
   [`marketing-stack.ts`](../infra/lib/marketing-stack.ts) (`AliasAAAA*`) and
   [`web.ts`](../infra/lib/constructs/web.ts) (`AliasAAAA`) — or set `enableIpv6: false`
   on the distributions. Clients then resolve IPv4 only; CloudFront IPv4 is universal.
   Kills the broken-IPv6 failure mode. Fully reversible.
2. **Drop HSTS `preload`.** Remove `preload: true` from the `strictTransportSecurity`
   block in **both** stacks (keep HSTS + a sane `max-age`; reconsider `includeSubdomains`).
   Do **not** submit to `hstspreload.org`. Keeps us out of a browser-hardcoded state
   that can't be bypassed on inspected networks. *(Confirm current preload status first —
   if already submitted, removal is slow.)*
3. **Submit filter re-categorisation** to the vendor list above (category: Health /
   Education), so young-domain filters allow us. Slow (days–weeks per vendor) but the
   only real fix for hypothesis 3.
4. **Deploy** both stacks via CDK using `--profile personal` (per repo AWS convention),
   targeting the live env.

## Verification

- Post-deploy: `dig AAAA placemate.uk` returns nothing; `curl -4` clean; SSL Labs still A.
- Re-check HSTS header no longer advertises `preload`.
- Real-world proof deferred: next time a beta user is on NHS WiFi, opportunistically ask
  if it now loads (no formal reporter task required, per the remote-only decision).

## Risks & limitations

- Remote-only can't confirm the hospital-side cause — hedges are **best-effort**.
- Dropping IPv6 is a minor capability regression (reversible).
- Filter re-categorisation is slow and per-vendor; UCLH's specific vendor is unknown
  without IT contact (so submit to all major ones).

## Open items

- Confirm actual HSTS-preload-list status for `placemate.uk`.
- Identify UCLH's filtering vendor (needs IT contact — out of scope under remote-only).
