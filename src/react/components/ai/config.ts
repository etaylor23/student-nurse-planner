/**
 * AI recall build-time config.
 *
 * The ask endpoint is a Lambda Function URL (not the same-origin `/api`), because API
 * Gateway can't stream responses — so its absolute URL has to reach the bundle as a Vite
 * env var, supplied by CI from the stack's `AiAskUrl` output. An empty value means the
 * feature is unconfigured for this build; `aiAvailable()` gates the UI so a
 * missing/failed deploy degrades to the coming-soon teaser rather than a broken input.
 */
export const AI_ASK_URL = (import.meta.env.VITE_AI_ASK_URL as string | undefined)?.trim() ?? "";

export function aiAvailable(): boolean {
  return AI_ASK_URL.length > 0;
}

/**
 * "Find more" sources (D10). The model emits only a topic phrase + a source key; the app
 * builds the URL, so the model can never invent a deep link that 404s or misattributes.
 * An unknown key falls back to NICE CKS.
 */
const SOURCES: Record<string, { label: string; search: (topic: string) => string }> = {
  "nice-cks": {
    label: "NICE CKS",
    search: (t) => `https://cks.nice.org.uk/search?q=${encodeURIComponent(t)}`,
  },
  nmc: {
    label: "NMC",
    search: (t) => `https://www.nmc.org.uk/search-results/?q=${encodeURIComponent(t)}`,
  },
  bnf: {
    label: "BNF",
    search: (t) => `https://bnf.nice.org.uk/?q=${encodeURIComponent(t)}`,
  },
};

export function resolveSource(source: string): { label: string; href: (topic: string) => string } {
  const entry = SOURCES[source] ?? SOURCES["nice-cks"];
  return { label: entry.label, href: entry.search };
}
