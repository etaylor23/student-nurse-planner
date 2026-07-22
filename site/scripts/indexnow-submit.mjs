// IndexNow submission — pings Bing/Yandex with the site's URLs so new/changed pages are
// discovered in minutes instead of waiting for a crawl. Runs post-deploy in CI (see
// ../.github/workflows/pipeline.yml, deploy-marketing job). Non-fatal by design: a failed
// ping must never fail a deploy.
//
// Reads the built sitemap (dist/sitemap-0.xml) for the URL list. The key file
// public/<KEY>.txt must exist and contain KEY (proves domain ownership to IndexNow).
import { readFile } from "node:fs/promises";

const KEY = "308a455ed2cdf1471808977c7d458544";
const HOST = "placemate.uk";
const ENDPOINT = "https://api.indexnow.org/indexnow";

async function main() {
  let xml;
  try {
    xml = await readFile(new URL("../dist/sitemap-0.xml", import.meta.url), "utf8");
  } catch {
    console.log("[indexnow] no dist/sitemap-0.xml — nothing to submit");
    return;
  }

  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) {
    console.log("[indexnow] sitemap had no <loc> entries — nothing to submit");
    return;
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });

  // IndexNow returns 200 (accepted) or 202 (accepted, pending). Anything else we just log.
  console.log(`[indexnow] submitted ${urlList.length} URL(s) → HTTP ${res.status}`);
}

main().catch((err) => {
  // Never fail the deploy over an indexing ping.
  console.log(`[indexnow] skipped (non-fatal): ${err?.message ?? err}`);
});
