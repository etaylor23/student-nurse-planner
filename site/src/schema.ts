// JSON-LD builders (schema.org). One consistent entity for the brand → helps Google and
// AI assistants build a confident "PlaceMate" entity. See spec §8. No aggregateRating /
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

// A standalone free tool page (calculator, practice quiz) modelled as a WebApplication.
// Free (offers price 0), part of the site, published by the Organization. See §5.
export function tool(t: {
  name: string;
  description: string;
  path: string; // site-relative, e.g. "/tools/placement-hours-calculator"
  category?: string; // schema.org applicationCategory
}): Node {
  const url = new URL(t.path, SITE.url).href.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: t.name,
    url,
    applicationCategory: t.category ?? "EducationalApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires a modern web browser with JavaScript.",
    description: t.description,
    inLanguage: "en-GB",
    isPartOf: { "@id": SITE_ID },
    publisher: { "@id": ORG_ID },
    offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
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

// Stable @id for an author, anchored on the About page's clinical-review section so the
// Person entity resolves to a real, on-site profile (E-E-A-T). See spec-seo-growth.md §4.
export const authorId = (slug: string) => `${SITE.url}/about#${slug}`;

export interface Author {
  name: string;
  slug: string;
  credential: string; // e.g. "Registered Nurse"
  description: string;
}

export function person(a: Author): Node {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": authorId(a.slug),
    name: a.name,
    jobTitle: a.credential,
    description: a.description,
    worksFor: { "@id": ORG_ID },
  };
}

// Article node for a /guides piece. When a named clinician (e.g. a Registered Nurse) has
// reviewed the piece, pass them as `author` — that Person reference is the E-E-A-T signal
// that matters for YMYL health content. With no `author`, authorship is the Organization
// (collective "PlaceMate team" byline) and NO person/credential claim is made.
export function article(a: {
  title: string;
  description: string;
  path: string; // site-relative, e.g. "/guides/how-to-write-a-nursing-reflection"
  datePublished: string; // ISO date
  dateModified?: string; // ISO date
  author?: Author;
  image?: string; // site-relative or absolute
}): Node {
  const url = new URL(a.path, SITE.url).href.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    inLanguage: "en-GB",
    url,
    mainEntityOfPage: url,
    datePublished: a.datePublished,
    dateModified: a.dateModified ?? a.datePublished,
    author: a.author ? { "@id": authorId(a.author.slug) } : { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID },
    ...(a.image ? { image: new URL(a.image, SITE.url).href } : {}),
  };
}
