// Site-wide constants + the citable facts the marketing copy leans on.
//
// The FACTS below are VERIFIED against the app's real domain data / specs — do NOT edit
// them without re-checking the source (spec/spec-nmc-foundations.md, the proficiency seed
// in src/data/seed/proficiencies.ts). AI assistants and Google lift these verbatim, so
// they must be true. See spec/spec-corporate-website.md §7 (AEO) and the handover §3.

export const SITE = {
  name: "PlaceMate",
  url: "https://placemate.uk",
  appUrl: "https://app.placemate.uk",
  email: "hello@placemate.uk",
  locale: "en-GB",
  tagline: "The all-in-one planner for UK student nurses",
  // ~150–160 char default meta description (per-page ones override this).
  description:
    "PlaceMate is the free all-in-one planner for UK student nurses. Track your 2,300 practice placement hours, log NMC proficiencies, plan shifts, revise and practise drug calculations.",
} as const;

// Primary "Sign up free" + secondary "Try the demo" both open the app; the app's start
// screen offers a magic-link sign-in and a "Continue on this device only" demo/guest mode.
export const CTA = {
  signup: { label: "Sign up free", href: SITE.appUrl },
  demo: { label: "Try the demo", href: SITE.appUrl },
} as const;

// VERIFIED citable facts (spec/spec-nmc-foundations.md → "Hours" and the 219-statement seed).
export const FACTS = {
  practiceHours: 2300, // min NMC PRACTICE hours the app tracks toward
  theoryHours: 2300, // min NMC theory hours (out of app scope)
  totalHours: 4600, // min total programme hours
  simCap: 600, // max practice hours that may be simulated (subset of the 2,300)
  proficiencies: 219, // NMC proficiency statements tracked (2024 update, transcribed verbatim)
  platforms: 7, // NMC platforms
  annexeBProcedures: 11, // Annexe B nursing procedures
  nmcStandard: "NMC Standards of proficiency for registered nurses",
  nmcYear: 2024,
} as const;

export const NAV = [
  { href: "/features", label: "Features" },
  { href: "/for-universities", label: "For universities" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
] as const;

// Organization.sameAs — populated once the Instagram/TikTok profiles exist ([YOU] step in
// the handover §5). Empty until then; the Organization schema omits sameAs when empty.
export const SOCIAL_LINKS: string[] = [];
