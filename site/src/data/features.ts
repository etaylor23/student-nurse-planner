// Feature content for /features (and the homepage grid). Each maps to a REAL, built app
// feature (src/react/components/*, verified against the spec/*.md). Don't add a feature
// the app doesn't ship. `keywords` are the intent terms each section targets (spec §4).
export interface Feature {
  id: string;
  name: string;
  tagline: string;
  body: string;
  points: string[];
  keywords: string;
  icon: "hours" | "planner" | "proficiency" | "skills" | "meds" | "reflection" | "revision" | "wellbeing";
  home?: boolean;
}

export const FEATURES: Feature[] = [
  {
    id: "placement-hours",
    name: "Placement hours tracker",
    tagline: "Never lose track of your 2,300 practice hours",
    body: "Log the hours for every shift and watch them count toward the NMC's 2,300-hour practice requirement — automatically, per placement and overall.",
    points: [
      "Running total against your 2,300-hour target",
      "Simulated hours flagged against the 600-hour cap",
      "A clear view of how many hours you have left",
    ],
    keywords: "placement hours tracker, clinical / practice hours log for student nurses",
    icon: "hours",
    home: true,
  },
  {
    id: "shift-planner",
    name: "Weekly shift planner",
    tagline: "Plan placement, uni and life in one calendar",
    body: "A calendar built for the realities of a nursing course — long days, night shifts and study weeks. Plan shifts ahead, then mark them as completed to feed your hours log.",
    points: [
      "Plan shifts, then count them when done",
      "See placement and revision side by side",
      "Link a shift to the proficiencies it evidences",
    ],
    keywords: "student nurse shift planner, nursing placement planner",
    icon: "planner",
    home: true,
  },
  {
    id: "proficiencies",
    name: "NMC proficiency tracker",
    tagline: "All 219 proficiencies, and the evidence for each",
    body: "Track every one of the 219 NMC proficiency statements across the 7 platforms and both annexes. Set a status, attach evidence from your shifts, skills and reflections, and see your gaps at a glance.",
    points: [
      "Statement-level tracking with a status history",
      "Attach shifts, medication logs and reflections as evidence",
      "Gap surfacing so nothing is left until the last minute",
    ],
    keywords: "NMC proficiency tracker, competency tracker for student nurses",
    icon: "proficiency",
    home: true,
  },
  {
    id: "clinical-skills",
    name: "Clinical skills passport",
    tagline: "The NMC Annexe B skills, plus your own",
    body: "Your clinical skills list seeds from the NMC's Annexe B nursing procedures — the national baseline every skills passport builds on — and you can add the local skills your university requires.",
    points: [
      "Seeded from the 11 Annexe B procedure groups",
      "Add and sign off your university's own skills",
      "Skills map 1:1 to their matching proficiencies",
    ],
    keywords: "clinical skills passport, nursing skills tracker",
    icon: "skills",
    home: true,
  },
  {
    id: "medications",
    name: "Medication notes & drug calculations",
    tagline: "Build medicines knowledge and numeracy",
    body: "Keep your own medication notes as you meet new drugs on placement, and sharpen your maths with a drug-calculation practice tool that checks your working and tracks accuracy.",
    points: [
      "Your personal medication reference",
      "Drug-calculation practice with instant feedback",
      "Accuracy stats linked to numeracy proficiencies 4.14 / B11.4",
    ],
    keywords: "drug calculation practice, medication numeracy for nurses",
    icon: "meds",
    home: true,
  },
  {
    id: "reflections",
    name: "Guided reflections",
    tagline: "Reflect with the Gibbs cycle, PII-safe",
    body: "Write structured reflections using the Gibbs reflective cycle, with a guided prompt for each of the six stages and a standing reminder to keep patient-identifiable information out.",
    points: [
      "Six guided Gibbs stages",
      "Standing patient-confidentiality reminder",
      "Link a reflection to a shift or proficiency as evidence",
    ],
    keywords: "nursing reflection template, Gibbs reflective cycle",
    icon: "reflection",
    home: true,
  },
  {
    id: "revision",
    name: "Revision timetable",
    tagline: "Plan your revision around placement",
    body: "Build a revision timetable that fits around shifts and deadlines, so exams and assignments never sneak up on you mid-placement.",
    points: [
      "Plan revision sessions around your shifts",
      "Keep assignments and exams in view",
    ],
    keywords: "nursing revision planner, student nurse revision timetable",
    icon: "revision",
  },
  {
    id: "self-care",
    name: "Self-care check-ins",
    tagline: "Look after the nurse, too",
    body: "Nursing training is demanding. Simple self-care check-ins help you notice how you are doing and build habits that keep you well across a tough placement.",
    points: ["Lightweight wellbeing check-ins", "Gentle prompts to look after yourself"],
    keywords: "student nurse wellbeing, self-care for student nurses",
    icon: "wellbeing",
  },
];
