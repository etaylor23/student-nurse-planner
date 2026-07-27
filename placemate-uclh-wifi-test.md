# placemate.uk won't load on UCLH WiFi — on-site tests

**The site is not broken.** From outside, both `placemate.uk` and `app.placemate.uk`
load perfectly: valid TLS 1.2/1.3, valid cert, HTTP/2, London edge, clean DNS.
The problem is something on the UCLH network. These tests pinpoint what.

Please run them **while on the UCLH WiFi that shows the error** and note the results.

---

## Phone tests (60 seconds, no laptop needed)

**Test 1 — the decisive one.** In Safari on the UCLH WiFi, open these two links:

- https://dufbsm93sx7h9.cloudfront.net
- https://dakqhmx911vvz.cloudfront.net

These are the *exact same servers* as placemate.uk, just under Amazon's own
already-trusted domain name.

- ✅ **These load, but `placemate.uk` still fails** → it's a **domain-name filter
  blocking our brand-new domain** (registered 12 days ago). This is the expected result.
- ❌ **These also fail** → it's a network-path problem (broken IPv6 / IP-range block /
  TLS interception), not the name.

**Test 2 — baseline.** Turn WiFi OFF, use mobile data (4G/5G), open https://placemate.uk.
It should load fine. (Confirms it's UCLH-network-specific, not the phone.)

**Test 3 — name the filter.** If anyone nearby has an Android phone or a laptop on the
same WiFi, open `https://placemate.uk` in Chrome or Edge. If you get a readable
"blocked by ..." / "category: newly registered domain" page, **screenshot it** — it tells
us exactly which filter and why.

---

## Laptop test (only if you have a Mac on the UCLH WiFi)

Paste this whole block into Terminal. It shows *where* the connection dies.

```bash
echo "### 1. DNS — should return CloudFront IPs (52.84.x.x / 2600:9000:...); anything else = DNS block"
dig +short app.placemate.uk A; dig +short app.placemate.uk AAAA
echo "### 2. IPv4-only path"
curl -4 -sS -o /dev/null -w "IPv4: HTTP %{http_code} in %{time_total}s\n" --max-time 15 https://app.placemate.uk || echo "IPv4: FAILED"
echo "### 3. IPv6-only path — if this fails/hangs but IPv4 works => broken IPv6 on the WiFi"
curl -6 -sS -o /dev/null -w "IPv6: HTTP %{http_code} in %{time_total}s\n" --max-time 15 https://app.placemate.uk || echo "IPv6: FAILED / no route"
echo "### 4. Raw CloudFront host vs custom domain"
curl -4 -sS -o /dev/null -w "cloudfront.net: HTTP %{http_code}\n" --max-time 15 https://dufbsm93sx7h9.cloudfront.net || echo "cloudfront.net: FAILED"
echo "### 5. Where does it die? (RST right after 'Client hello' = SNI-based domain filtering)"
curl -4 -v --max-time 15 https://app.placemate.uk 2>&1 | grep -iE "trying|connected|client hello|server hello|reset|refused|timed out|HTTP/" | head -25
```

Send me the output and I'll confirm the exact cause.
