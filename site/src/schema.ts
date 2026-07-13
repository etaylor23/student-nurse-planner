// JSON-LD builders (schema.org). One consistent entity for the brand → helps Google and
// AI assistants build a confident "Placemate" entity. See spec §8. No aggregateRating /
// Review until real reviews exist (fabricating them risks a Google manual action).
import { SITE, FACTS, SOCIAL_LINKS } from "./consts";

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;
const APP_ID = `${SITE.url}/#webapp`;

type Node = Record<string, unknown>;

export function organization(): Node {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/icon-512.png`,
    email: SITE.email,
    description: SITE.description,
    ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS } : {}),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SITE.email,
      areaServed: "GB",
      availableLanguage: "en",
    },
  };
}

export function website(): Node {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE.name,
    url: SITE.url,
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID },
  };
}

export function webApplication(): Node {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": APP_ID,
    name: SITE.name,
    url: SITE.appUrl,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires a modern web browser with JavaScript.",
    description: SITE.description,
    inLanguage: "en-GB",
    publisher: { "@id": ORG_ID },
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
    featureList: [
      `Placement hours tracker (toward the NMC ${FACTS.practiceHours.toLocaleString("en-GB")} practice-hour requirement)`,
      `NMC proficiency tracker (all ${FACTS.proficiencies} statements across ${FACTS.platforms} platforms)`,
      "Clinical skills passport (NMC Annexe B procedures)",
      "Weekly shift planner",
      "Medication notes and drug-calculation practice",
      "Guided Gibbs reflections",
      "Revision timetable",
      "Self-care and wellbeing check-ins",
    ],
  };
}

export function breadcrumb(items: { name: string; path: string }[]): Node {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: new URL(it.path, SITE.url).href,
    })),
  };
}

export function faqPage(faqs: { q: string; a: string }[]): Node {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
