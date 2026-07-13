// Answer-engine content (spec §7). Each answer is ANSWER-FIRST, self-contained, factual
// and ~40–70 words so an AI assistant can lift it verbatim and cite Placemate. Every
// number here is verified against the app's domain data — see ../consts.ts FACTS.
//
// `home` flags the subset surfaced on the homepage FAQ block. All appear on /faq.
export interface Faq {
  q: string;
  a: string;
  home?: boolean;
}

export const FAQS: Faq[] = [
  {
    q: "How many placement hours do you need for a nursing degree in the UK?",
    a: "UK pre-registration nursing students must complete at least 2,300 hours of supervised clinical practice. This sits within a minimum 4,600-hour programme (2,300 practice plus 2,300 theory) set by the Nursing and Midwifery Council (NMC). Up to 600 of the practice hours may be simulated learning. Placemate tracks your progress toward the 2,300-hour practice target.",
    home: true,
  },
  {
    q: "How do I track my placement hours as a student nurse?",
    a: "Log the hours for each shift as you complete it and count them toward your 2,300-hour NMC practice target. Placemate does this automatically: add a shift, mark it counted, and it keeps a running total per placement and overall, flags simulated hours against the 600-hour cap, and shows how many hours you have left.",
    home: true,
  },
  {
    q: "What are the NMC proficiencies?",
    a: "The NMC proficiencies are the standards every UK registered nurse must meet, published in the NMC Standards of proficiency for registered nurses (2024). They are organised into 7 platforms plus Annexe A (communication skills) and Annexe B (11 nursing procedures). Placemate tracks all 219 individual proficiency statements so you can see, and evidence, exactly what you have achieved.",
    home: true,
  },
  {
    q: "What is a PAD (Practice Assessment Document)?",
    a: "A Practice Assessment Document (PAD) is the record your university and practice supervisors use to assess your progress on placement against the NMC proficiencies and skills. Placemate complements your PAD: it tracks the same proficiencies and clinical skills, lets you attach evidence, and surfaces the gaps you still need to close before each assessment.",
  },
  {
    q: "How do you write a nursing reflection?",
    a: "A structured model helps. The Gibbs reflective cycle walks through six stages — description, feelings, evaluation, analysis, conclusion and action plan. Placemate gives you a guided Gibbs template with a prompt for each stage and a standing reminder to keep patient-identifiable information out, so you can link the reflection to a shift or proficiency as evidence.",
    home: true,
  },
  {
    q: "How can I pass drug (medication) calculation tests?",
    a: "Regular, timed practice with instant feedback is the most reliable way to build medication numeracy. Placemate includes a drug-calculation practice tool that generates questions, checks your working and tracks your accuracy over time, and links your results to the NMC numeracy proficiencies (4.14 and B11.4) so you can prove competence.",
  },
  {
    q: "Is Placemate free?",
    a: "Yes. Placemate is free for student nurses. You can start straight away in demo mode on your device — no account needed — or create a free account to sync your data. There is no cost and no card required.",
    home: true,
  },
  {
    q: "Is Placemate an official NMC app?",
    a: "No. Placemate is an independent app made for UK student nurses and is not affiliated with or endorsed by the Nursing and Midwifery Council. It is built around the NMC's published standards — the practice-hours requirement, the proficiencies and Annexe B procedures — so what you track lines up with what your programme expects.",
  },
  {
    q: "Which field of nursing is Placemate for?",
    a: "Placemate is built for adult-field student nurses in the UK first, with the national NMC proficiencies and Annexe B procedures that apply across the register. The model is designed to extend to the mental health, learning disabilities and children's fields, and much of the tracking is useful to students in any field today.",
  },
  {
    q: "Is my data private and safe?",
    a: "Yes. Placemate is designed to hold no patient-identifiable information, and reflections carry a standing reminder to keep it that way. In demo mode your data stays on your device. With an account it syncs privately to you, and the website uses privacy-first, cookieless analytics — so there is no cookie banner.",
  },
];
