/**
 * A third-year student's worth of data — roughly two and a half years of use.
 *
 * Distinct from `src/data/seed/demo.ts` (the in-app, part-2 "try it" dataset): this one
 * is a **demo environment**, sized and written to exercise every screen at realistic
 * volume AND to make AI recall demonstrable. That second goal drives the content: shift
 * notes and reflections here are specific and procedural ("estimate systolic from the
 * radial pulse first", "the 30-degree angle for a subcut"), because "what did I write
 * about X?" only lands when there is a real, quotable X to find.
 *
 * Pure data + builders: no AWS, no Repository — the caller supplies one, so the same
 * dataset can be written server-side by a script or client-side in a browser.
 */
import type { Repository } from "../../src/data/repository";
import type {
  CalcType,
  GibbsStage,
  MedLogType,
  ProficiencyStatus,
  ShiftType,
  SkillStage,
} from "../../src/domain/types";
import { computeNetHours } from "../../src/logic/hours";
import { defaultBreakRules } from "../../src/logic/breakRules";
// Reference/seed data is GLOBAL, not user-owned, so the server-side repository doesn't
// store or list it (`listProficiencies` is a deliberate stub). Read the same bundled
// seed the client does — the ids match, so progress/evidence rows line up exactly.
import { seedProficiencies } from "../../src/data/seed/proficiencies";
import { seedSkills } from "../../src/data/seed/skills";
import { seedSubjects } from "../../src/data/seed/subjects";

// ---------------------------------------------------------------------------
// Timeline helpers — everything is relative to "today" so the demo never goes stale.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

function isoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
}
function isoAt(daysAgo: number, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

/** Deterministic pseudo-random so re-runs produce the same shape. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Placements — six across three years, newest last.
// ---------------------------------------------------------------------------

interface PlacementSpec {
  name: string;
  settingType: string;
  startsDaysAgo: number;
  endsDaysAgo: number;
  /** Shift-note pool for this placement — the flavour of what they were learning. */
  notes: string[];
}

const PLACEMENTS: PlacementSpec[] = [
  {
    name: "Ward 9 — Care of the Elderly, St Mary's",
    settingType: "Acute medical ward",
    startsDaysAgo: 880,
    endsDaysAgo: 790,
    notes: [
      "First proper week on the ward. Shadowed my PA for the drug round and practised manual blood pressures — she showed me to rest the patient 5 minutes first, arm supported at heart level, cuff on a bare upper arm, estimate systolic from the radial pulse before inflating about 30 mmHg above it, then deflate 2–3 mmHg per second. First Korotkoff sound is systolic, last is diastolic. Feedback: I deflate too fast.",
      "Helped with a full set of obs on six patients. Getting quicker at NEWS2 scoring — remembered that a score of 5 or more needs an urgent review and to escalate rather than sit on it.",
      "Assisted with personal care for a gentleman with advanced dementia. Learned more from how my PA talked to him than from anything else — short sentences, one instruction at a time, plenty of waiting.",
      "Repositioning and pressure area care. Used the Waterlow score for the first time and looked properly at heels and sacrum. Documented skin condition in the notes.",
      "Busy late shift. Two admissions from A&E. I did the baseline obs and the manual handling assessment for both.",
      "Practised hand hygiene audit with the ward sister — five moments. I keep forgetting the moment *before* a clean procedure, so writing it here to make it stick.",
    ],
  },
  {
    name: "Community District Nursing, Riverside Team",
    settingType: "Community",
    startsDaysAgo: 760,
    endsDaysAgo: 690,
    notes: [
      "Out with the district nurses. Completely different pace — you're a guest in someone's home. Watched a leg ulcer dressing change and the doppler for ABPI before compression.",
      "Aseptic non-touch technique in a front room with a cat. My PA walked me through it: clean hands, gather and check equipment, clean the tray, hands again, set up the field, identify the key-parts, stay non-touch throughout, dispose of waste, hands to finish. The principle is protecting key-parts, not the setting.",
      "Insulin administration with a patient who self-manages. Talked through subcut technique — 4mm needle straight in at 90 degrees, rotate sites, no need to pinch with the short needles.",
      "Catheter care visit. Reinforced the importance of the drainage bag staying below bladder level and not disconnecting the closed system unnecessarily.",
      "Palliative visit with the specialist nurse. Mostly listening. Learned about anticipatory medicines being in the house before they're needed.",
    ],
  },
  {
    name: "Surgical Admissions Unit, St Mary's",
    settingType: "Surgical",
    startsDaysAgo: 640,
    endsDaysAgo: 560,
    notes: [
      "Pre-op checks all shift. The WHO checklist is drilled in now — patient identity, procedure, site marking, allergies, consent, fasting status.",
      "Watched a laparoscopic cholecystectomy from the gallery. Seeing the anatomy made the post-op observations make far more sense.",
      "Post-op recovery obs. Practised a structured ABCDE assessment on a patient who was slow to wake — airway, breathing, circulation, disability, exposure, in that order, fixing as you go.",
      "Wound assessment and dressing selection. Learned that a wound needs a moist environment to heal, and that 'dry and scabbed' is not the goal.",
      "Drain management and output charting. Also did my first proper fluid balance chart end to end.",
      "Escalated a patient whose respiratory rate had crept from 16 to 24 over two sets of obs. My PA said noticing the trend rather than the single number was the right instinct.",
    ],
  },
  {
    name: "Mental Health Liaison, City General",
    settingType: "Mental health",
    startsDaysAgo: 520,
    endsDaysAgo: 450,
    notes: [
      "First day on liaison. Sat in on a mental state examination — appearance, behaviour, speech, mood, thought, perception, cognition, insight.",
      "Learned about risk assessment being a conversation rather than a form. Asking directly about suicidal thoughts does not plant the idea.",
      "De-escalation training in practice. Lower voice, more space, no blocking the door, and never argue with the content of a delusion.",
      "Capacity assessment with the consultant. The two-stage test — is there an impairment of mind or brain, and does it mean they can't understand, retain, weigh up, or communicate the decision.",
      "Sat with a patient in A&E for two hours waiting for a bed. Did nothing clinical. It was still the most useful shift I've had.",
    ],
  },
  {
    name: "Paediatric Assessment Unit, City General",
    settingType: "Paediatrics",
    startsDaysAgo: 400,
    endsDaysAgo: 330,
    notes: [
      "Paediatric obs are a different world — normal ranges shift with age and you assess the child before you touch them. Learned to do respiratory rate by watching from across the room.",
      "Weight-based drug calculations all shift. Checked every one twice with my PA. The formula I keep coming back to is: dose required divided by stock strength, times the volume the stock comes in.",
      "Watched a bronchiolitis admission. Recognising increased work of breathing — recession, tracheal tug, head bobbing, nasal flaring — is more useful than any single number.",
      "Family-centred care in practice. The parents knew the child's baseline far better than any of us.",
      "Practised paediatric BLS on the manikin. 15:2 compressions to breaths for two rescuers, compression depth about a third of chest diameter.",
    ],
  },
  {
    name: "Ward 4 — Acute Medicine, St Mary's (management placement)",
    settingType: "Acute medical ward",
    startsDaysAgo: 120,
    endsDaysAgo: -14, // still running, a couple of weeks to go
    notes: [
      "Final management placement. Took a bay of four patients with my PA supervising from a distance rather than at my shoulder. Exhausting but the good kind.",
      "Led the handover for my bay using SBAR — situation, background, assessment, recommendation. Much better received when I stuck to the structure instead of telling the story chronologically.",
      "Full drug round for the bay under supervision. Checked the five rights every time: right patient, right drug, right dose, right route, right time — plus allergy band, expiry, and whether it had been withheld. Signed only once it was actually taken.",
      "Sepsis screening on a patient who spiked a temperature. Sepsis Six within the hour — oxygen, blood cultures, IV antibiotics, IV fluids, lactate, urine output monitoring.",
      "Difficult conversation with a family about discharge planning. Stayed quiet more than I wanted to and let the sister lead.",
      "Delegated bed baths to the HCA for the first time and felt strange about it. My PA pointed out that delegating appropriately IS the third-year skill.",
      "Venepuncture — three successful, one miss. The miss was going in too steep. Tourniquet no more than a minute, and release before withdrawing the needle.",
      "Managed my own time across the bay including two discharges and a transfer. Prioritisation is the whole job.",
      "ECG lead placement with the cardiac nurse. V1 fourth intercostal space right sternal edge, V2 mirror left, V4 fifth space mid-clavicular, V3 between V2 and V4, V5 anterior axillary, V6 mid-axillary, level with V4.",
      "NG tube insertion observed then assisted. pH testing the aspirate — needs to be 5.5 or below before anything goes down it. Never rely on the whoosh test.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Reflections — full Gibbs cycles on the moments that actually stuck.
// ---------------------------------------------------------------------------

const GIBBS: GibbsStage[] = [
  "DESCRIPTION",
  "FEELINGS",
  "EVALUATION",
  "ANALYSIS",
  "CONCLUSION",
  "ACTION_PLAN",
];

interface ReflectionSpec {
  title: string;
  daysAgo: number;
  tags: string[];
  sections: string[]; // in GIBBS order
}

const REFLECTIONS: ReflectionSpec[] = [
  {
    title: "The first time I escalated a deteriorating patient",
    daysAgo: 600,
    tags: ["deterioration", "escalation", "communication"],
    sections: [
      "On a late shift on the surgical unit I took a routine set of observations on a post-op patient. His respiratory rate had gone from 16 that morning to 24, and he looked grey although he said he felt fine. His NEWS2 came to 6.",
      "I felt uncertain and slightly embarrassed about bothering the registrar — he had told me he felt fine and I worried I was overreacting to a number.",
      "I did escalate, and the registrar came within ten minutes. The patient had an early chest infection and was started on antibiotics that evening. Waiting would have made it worse. What went badly was the delay: I spent nearly fifteen minutes deciding.",
      "Looking back, the reason I hesitated was that I was weighting the patient's own reassurance above the objective trend. NEWS2 exists precisely because deterioration is often silent to the patient. I also had not yet internalised that escalating and being wrong carries almost no cost, while not escalating and being wrong carries an enormous one.",
      "I learned that a trend across observations is more informative than any single reading, and that escalation is a normal part of the system rather than an admission of failure.",
      "Next placement I will escalate as soon as the criteria are met rather than looking for extra reassurance first, and I will use SBAR so the handover is quick and clear.",
    ],
  },
  {
    title: "Getting aseptic non-touch technique wrong in someone's living room",
    daysAgo: 700,
    tags: ["ANTT", "infection control", "community"],
    sections: [
      "During a community placement I was setting up for a leg ulcer dressing change. I laid my sterile field on a side table, then reached across it to pick up scissors and contaminated the field.",
      "I was mortified, particularly because the patient noticed my face and asked if something was wrong.",
      "My practice assessor stopped me calmly, we started again with a fresh pack, and the dressing was completed safely. The recovery was handled well; my preparation was not.",
      "The underlying issue was that I had learned ANTT as a sequence of steps in a clinical skills lab, not as a principle. In a lab the layout is always the same, so I never had to think about where the key-parts were. In a living room I had to design the field myself and I did not plan the order I would reach for things.",
      "Asepsis is about protecting key-parts and key-sites, and the environment changes how you achieve that. Understanding why beats memorising a sequence.",
      "Before any aseptic procedure I now mentally rehearse where each item goes and the order I will touch them, and I set the field up on my dominant side. I have used this on every dressing since without a repeat.",
    ],
  },
  {
    title: "Sitting with a patient in A&E for two hours",
    daysAgo: 470,
    tags: ["mental health", "compassion", "communication"],
    sections: [
      "On my mental health liaison placement I stayed with a young woman in A&E who was waiting for a psychiatric bed. There was nothing clinical to do. We talked a little and were quiet a lot.",
      "I felt useless for most of it, and guilty that I was not doing something more obviously productive on a busy shift.",
      "She later told the liaison nurse that having someone stay had made the wait bearable. The shift went well in a way I had not expected and did not initially recognise.",
      "I had absorbed an idea of nursing as a series of tasks, so time without a task registered as time wasted. Therapeutic presence is an intervention — it just is not one that generates an entry on a chart. The NMC Code frames this as prioritising people, which includes their dignity and distress and not only their physiology.",
      "Being with someone is a legitimate and skilled part of the job, not a gap between the real work.",
      "I will consciously protect a few minutes with patients who are distressed rather than filling every moment with tasks, and I will name it in handover so it is valued rather than invisible.",
    ],
  },
  {
    title: "My first medication error near-miss",
    daysAgo: 250,
    tags: ["medicines management", "patient safety", "candour"],
    sections: [
      "On a drug round I drew up what I believed was the prescribed dose of an opioid analgesic. At the second check my practice assessor spotted that I had misread the units on the prescription and had drawn up double the intended dose. It never reached the patient.",
      "I felt sick. I had been confident, which in hindsight is the frightening part.",
      "The second check worked exactly as designed, which is the point of it. My own process failed at the reading stage because I was hurrying to finish before the ward round.",
      "The error came from anchoring on what I expected the dose to be rather than reading what was written, made more likely by time pressure. The five rights are a defence against exactly this, but only if each one is actually performed rather than recited. I also reflected on candour — my assessor documented it as a near-miss, and treating it as learning rather than blame is what makes reporting safe.",
      "Independent double-checking is a real safety barrier and not a formality, and confidence is not a substitute for reading the prescription.",
      "I now read the prescription aloud with the checker, and I do not start a drug round in the last twenty minutes before a ward round. I have had no repeat since.",
    ],
  },
  {
    title: "Leading a handover for my own bay",
    daysAgo: 60,
    tags: ["leadership", "SBAR", "management placement"],
    sections: [
      "On my management placement I gave the handover for my bay of four patients to the incoming late shift, with my practice assessor observing rather than assisting.",
      "Nervous beforehand, and quite pleased afterwards.",
      "The first patient took too long because I told the story chronologically from admission. For the remaining three I switched to SBAR and each took about ninety seconds while carrying more information.",
      "Chronological storytelling feels natural because it is how I hold the information myself, but it makes the listener do the work of extracting what matters. SBAR front-loads the relevant point and puts the recommendation explicitly on the table, which also makes it harder to leave a concern unspoken.",
      "Structure in communication is a clinical skill with a safety function, not presentational polish.",
      "I will use SBAR for every handover and escalation, and I am going to ask for feedback on my next three handovers specifically about whether the recommendation was clear.",
    ],
  },
  {
    title: "Delegating for the first time",
    daysAgo: 30,
    tags: ["leadership", "delegation", "management placement"],
    sections: [
      "I asked the healthcare assistant on my bay to carry out personal care for two patients while I completed a drug round and a discharge.",
      "Uncomfortable. It felt like offloading the work I had spent two years learning to do well.",
      "The care was done to a high standard and the bay ran on time, which it would not have done otherwise. It went well; my feelings about it lagged behind.",
      "My discomfort came from equating hands-on care with being a good nurse. Delegation is accountable — I remained responsible for ensuring the task was appropriate, the person was competent, and the outcome was checked. Done properly it is a way of making sure the whole bay is safe rather than a way of avoiding work.",
      "Registered practice means being accountable for care I do not personally deliver, and that is a skill to develop rather than a compromise to tolerate.",
      "I will keep delegating deliberately on this placement, always checking back on the outcome, and I will ask my assessor to observe a delegation conversation so I can be assessed on it.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Medications, skills, competencies, revision.
// ---------------------------------------------------------------------------

const MEDICATIONS: Array<{
  name: string;
  drugClass: string;
  bodySystem: string;
  routes: string;
  conditions: string[];
  keyNotes: string;
  highAlert?: boolean;
}> = [
  {
    name: "Paracetamol",
    drugClass: "Analgesic (non-opioid)",
    bodySystem: "Nervous system",
    routes: "PO,IV,PR",
    conditions: ["Mild to moderate pain", "Pyrexia"],
    keyNotes:
      "Maximum 4 g in 24 hours in adults. Reduce in low body weight — check the chart before assuming the standard dose.",
  },
  {
    name: "Codeine phosphate",
    drugClass: "Opioid analgesic",
    bodySystem: "Nervous system",
    routes: "PO",
    conditions: ["Moderate pain"],
    keyNotes: "Constipating — check bowels are being managed. Not for under-12s.",
  },
  {
    name: "Morphine sulfate",
    drugClass: "Opioid analgesic",
    bodySystem: "Nervous system",
    routes: "PO,IV,SC",
    conditions: ["Severe pain"],
    keyNotes:
      "Controlled drug — two signatures, CD register, stock check. Watch respiratory rate and sedation.",
    highAlert: true,
  },
  {
    name: "Furosemide",
    drugClass: "Loop diuretic",
    bodySystem: "Cardiovascular",
    routes: "PO,IV",
    conditions: ["Heart failure", "Fluid overload"],
    keyNotes: "Monitor U&Es and fluid balance. Give in the morning so it doesn't disturb sleep.",
  },
  {
    name: "Amoxicillin",
    drugClass: "Penicillin antibiotic",
    bodySystem: "Infection",
    routes: "PO,IV",
    conditions: ["Chest infection", "UTI"],
    keyNotes: "Always check the allergy band first — penicillin allergy is the one people assume.",
  },
  {
    name: "Enoxaparin",
    drugClass: "Low molecular weight heparin",
    bodySystem: "Blood",
    routes: "SC",
    conditions: ["VTE prophylaxis"],
    keyNotes: "Subcut into the abdomen, rotate sides. Don't expel the air bubble. Check platelets.",
    highAlert: true,
  },
  {
    name: "Insulin (NovoRapid)",
    drugClass: "Rapid-acting insulin",
    bodySystem: "Endocrine",
    routes: "SC",
    conditions: ["Diabetes mellitus"],
    keyNotes:
      "Never abbreviate 'units'. Insulin-specific syringe only. Check blood glucose before administering.",
    highAlert: true,
  },
  {
    name: "Salbutamol",
    drugClass: "Short-acting beta-2 agonist",
    bodySystem: "Respiratory",
    routes: "INH,NEB",
    conditions: ["Asthma", "COPD"],
    keyNotes:
      "Watch for tremor and tachycardia. Check inhaler technique — most people get it wrong.",
  },
  {
    name: "Omeprazole",
    drugClass: "Proton pump inhibitor",
    bodySystem: "Gastrointestinal",
    routes: "PO,IV",
    conditions: ["Gastric protection", "Reflux"],
    keyNotes: "Often prescribed alongside steroids or NSAIDs for protection.",
  },
  {
    name: "Bisoprolol",
    drugClass: "Beta blocker",
    bodySystem: "Cardiovascular",
    routes: "PO",
    conditions: ["Heart failure", "Hypertension"],
    keyNotes: "Check heart rate before giving — hold and escalate if bradycardic.",
  },
  {
    name: "Warfarin",
    drugClass: "Vitamin K antagonist",
    bodySystem: "Blood",
    routes: "PO",
    conditions: ["Atrial fibrillation", "VTE treatment"],
    keyNotes:
      "INR-dependent dose — check today's INR and the anticoagulation chart, never the last known dose.",
    highAlert: true,
  },
  {
    name: "Metformin",
    drugClass: "Biguanide",
    bodySystem: "Endocrine",
    routes: "PO",
    conditions: ["Type 2 diabetes"],
    keyNotes: "Withhold around contrast imaging. GI side effects settle with time and food.",
  },
];

/** Skill name fragments to look for in the seeded Annexe B list, with a target stage. */
const SKILL_TARGETS: Array<{ match: string; stage: SkillStage; signOff?: boolean }> = [
  { match: "blood pressure", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "pulse", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "temperature", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "respirat", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "oxygen satur", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "hand hygiene", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "aseptic", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "medicines", stage: "PERFORMED_UNDER_SUPERVISION" },
  { match: "injection", stage: "PERFORMED_UNDER_SUPERVISION" },
  { match: "venepuncture", stage: "ASSISTED" },
  { match: "cannula", stage: "ASSISTED" },
  { match: "catheter", stage: "ASSISTED" },
  { match: "wound", stage: "PERFORMED_UNDER_SUPERVISION" },
  { match: "pressure", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "nutrition", stage: "PERFORMED_UNDER_SUPERVISION" },
  { match: "fluid balance", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
  { match: "nasogastric", stage: "OBSERVED" },
  { match: "ecg", stage: "ASSISTED" },
  { match: "resuscitation", stage: "ASSISTED" },
  { match: "moving and handling", stage: "PERFORMED_UNDER_SUPERVISION", signOff: true },
];

const REVISION_TOPICS = [
  {
    subject: "pharmac",
    topics: ["Drug calculations", "Anticoagulants", "Antibiotic stewardship", "Controlled drugs"],
  },
  { subject: "anatomy", topics: ["Cardiac cycle", "Renal function", "Respiratory gas exchange"] },
  {
    subject: "profession",
    topics: ["NMC Code", "Accountability & delegation", "Consent & capacity"],
  },
  { subject: "acute", topics: ["Sepsis Six", "ABCDE assessment", "NEWS2 escalation"] },
];

const SELF_CARE_ITEMS = ["sleep", "food", "movement", "connection", "debrief", "protected-time"];

export interface SeedCounts {
  placements: number;
  shifts: number;
  reflections: number;
  medications: number;
  medicationLogs: number;
  skills: number;
  proficiencies: number;
  evidenceLinks: number;
  revisionSessions: number;
  selfCareCheckins: number;
  calcDrills: number;
  logItems: number;
}

/**
 * Write the whole dataset through `repo`. Additive — it never deletes, so an account
 * with a little real data keeps it.
 */
export async function seedThirdYearDemo(
  repo: Repository,
  userId: string,
  log: (m: string) => void = () => {},
): Promise<SeedCounts> {
  const counts: SeedCounts = {
    placements: 0,
    shifts: 0,
    reflections: 0,
    medications: 0,
    medicationLogs: 0,
    skills: 0,
    proficiencies: 0,
    evidenceLinks: 0,
    revisionSessions: 0,
    selfCareCheckins: 0,
    calcDrills: 0,
    logItems: 0,
  };
  const rand = rng(20260726);

  // ---- Profile: a third-year, part 3 of 3, registration in sight. ----
  await repo.updateUser({
    displayName: "Ellis",
    field: "ADULT",
    programmeType: "BSC_3YR",
    currentPart: 3,
    totalParts: 3,
    startDate: isoDay(900),
    targetRegistrationDate: isoDay(-120), // ~4 months out
  });
  const rules = defaultBreakRules();

  // ---- Placements + their shifts. ----
  const shiftTypes: ShiftType[] = ["EARLY", "LATE", "LONG_DAY", "NIGHT"];
  const shiftIdsByPlacement: Record<string, string[]> = {};
  const allShiftIds: string[] = [];

  for (const spec of PLACEMENTS) {
    const placement = await repo.createPlacement({
      userId,
      name: spec.name,
      settingType: spec.settingType,
      startDate: isoDay(spec.startsDaysAgo),
      endDate: isoDay(spec.endsDaysAgo),
    });
    counts.placements++;
    shiftIdsByPlacement[placement.id] = [];

    // A shift roughly every 2.4 days across the placement window, ~3 a week.
    const span = spec.startsDaysAgo - spec.endsDaysAgo;
    const total = Math.max(6, Math.round(span / 2.4));
    for (let i = 0; i < total; i++) {
      const daysAgo = Math.round(spec.startsDaysAgo - (i * span) / total);
      const future = daysAgo < 0;
      const type = shiftTypes[Math.floor(rand() * shiftTypes.length)];
      const [start, end] =
        type === "NIGHT"
          ? ["19:30", "07:30"]
          : type === "LONG_DAY"
            ? ["07:00", "19:30"]
            : type === "EARLY"
              ? ["07:00", "14:30"]
              : ["13:00", "21:00"];
      const startAt = isoAt(daysAgo, start);
      const endAt = isoAt(type === "NIGHT" ? daysAgo - 1 : daysAgo, end);
      const rawMins = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
      // Notes on roughly half the shifts — a real log is patchy, not uniform.
      const note = i % 2 === 0 ? spec.notes[Math.floor((i / 2) % spec.notes.length)] : undefined;

      const shift = await repo.createShift({
        userId,
        placementId: placement.id,
        date: isoDay(daysAgo),
        startAt,
        endAt,
        shiftType: type,
        entryMode: "RAW",
        rawDurationMins: rawMins,
        netHours: computeNetHours({ entryMode: "RAW", rawDurationMins: rawMins }, rules).netHours,
        isSimulated: false,
        status: future ? "PLANNED" : "COMPLETED",
        supervisingRnName: future ? undefined : "Nicola Hartley (PA)",
        notes: note,
      });
      counts.shifts++;
      shiftIdsByPlacement[placement.id].push(shift.id);
      if (!future) allShiftIds.push(shift.id);
    }
    log(`  placement "${spec.name}" + ${total} shifts`);
  }

  // A handful of simulated-practice hours, as most programmes now include.
  for (let i = 0; i < 6; i++) {
    const daysAgo = 300 - i * 30;
    await repo.createShift({
      userId,
      date: isoDay(daysAgo),
      shiftType: "OTHER",
      entryMode: "NET",
      netHours: 7.5,
      isSimulated: true,
      status: "COMPLETED",
      supervisingRnName: "Simulation lead",
      notes:
        i % 2 === 0
          ? "Simulation suite: deteriorating patient scenario. ABCDE then SBAR to the 'registrar'. Video debrief afterwards was brutal but useful."
          : undefined,
    });
    counts.shifts++;
  }

  // ---- Reflections (full Gibbs) + tags. ----
  const reflectionIds: string[] = [];
  for (const spec of REFLECTIONS) {
    const reflection = await repo.createReflection(
      {
        userId,
        title: spec.title,
        model: "GIBBS",
        occurredOn: isoDay(spec.daysAgo),
        isLocked: false,
        piiAcknowledged: true,
      },
      GIBBS.map((stage, i) => ({ stage, content: spec.sections[i] ?? "" })),
    );
    await repo.setReflectionTags(userId, reflection.id, spec.tags);
    reflectionIds.push(reflection.id);
    counts.reflections++;
  }
  log(`  ${counts.reflections} reflections (full Gibbs + tags)`);

  // ---- Medications, conditions and logs. ----
  const medIds: string[] = [];
  for (const med of MEDICATIONS) {
    const created = await repo.createMedication({
      userId,
      name: med.name,
      drugClass: med.drugClass,
      bodySystem: med.bodySystem,
      routes: med.routes,
      keyNotes: med.keyNotes,
      highAlert: med.highAlert ?? false,
    });
    medIds.push(created.id);
    counts.medications++;
    for (const condition of med.conditions) {
      await repo.addMedicationCondition(created.id, condition);
    }
  }
  const medLogNotes = [
    "Observed my PA give this. Checked the allergy band and the chart together first.",
    "Administered under supervision. Double-checked the dose against the prescription and read it aloud with my checker.",
    "Controlled drug — two of us to the cupboard, signed the register, stock count matched.",
    "Patient asked what it was for, so I explained it in plain English. Good practice for me too.",
    "Withheld — heart rate was 48 so I checked with the doctor before giving. Documented the reason.",
    "Gave subcut into the abdomen, rotated from the site used yesterday.",
  ];
  for (let i = 0; i < 28; i++) {
    const type: MedLogType = i % 3 === 0 ? "OBSERVED" : "ADMINISTERED";
    await repo.createMedicationLog({
      userId,
      medicationId: medIds[i % medIds.length],
      shiftId: allShiftIds[Math.floor(rand() * allShiftIds.length)],
      type,
      date: isoDay(Math.round(rand() * 400)),
      route: "PO",
      notes: i % 2 === 0 ? medLogNotes[i % medLogNotes.length] : undefined,
    });
    counts.medicationLogs++;
  }
  log(`  ${counts.medications} medications + ${counts.medicationLogs} med logs`);

  // ---- Clinical skills: stages + sign-offs on the seeded Annexe B list. ----
  const skills = seedSkills;
  for (const target of SKILL_TARGETS) {
    const skill = skills.find((s) => s.name.toLowerCase().includes(target.match));
    if (!skill) continue;
    await repo.setSkillStage(userId, skill.id, target.stage);
    counts.skills++;
    if (target.signOff) {
      await repo.signOffSkill(userId, skill.id, {
        signOffByName: "Nicola Hartley",
        signOffLocation: "Ward 4, St Mary's",
        signOffDate: isoDay(Math.round(30 + rand() * 300)),
      });
    }
  }
  await repo.addCustomSkill(userId, {
    name: "Doppler ABPI measurement",
    category: "Community nursing",
  });
  counts.skills++;
  log(`  ${counts.skills} clinical skills staged/signed off`);

  // ---- NMC proficiencies: progress across the platforms + evidence links. ----
  const proficiencies = seedProficiencies;
  const statuses: ProficiencyStatus[] = ["ACHIEVED", "ACHIEVED", "DEVELOPING", "NOT_YET_ACHIEVED"];
  const chosen = proficiencies.filter((_, i) => i % 3 === 0).slice(0, 60);
  for (let i = 0; i < chosen.length; i++) {
    const prof = chosen[i];
    const status = statuses[i % statuses.length];
    if (status === "NOT_YET_ACHIEVED") continue;
    await repo.setProficiencyStatus(userId, prof.id, {
      status,
      partIndex: status === "ACHIEVED" ? 2 + (i % 2) : 3,
      occurredAt: isoDay(Math.round(20 + rand() * 400)),
      assessorName: "Nicola Hartley",
      note:
        i % 4 === 0
          ? "Discussed with my practice assessor at the midpoint interview — agreed I've met this consistently across the bay."
          : undefined,
    });
    counts.proficiencies++;
    if (status === "ACHIEVED" && i % 2 === 0) {
      await repo.setProficiencyPadSignOff(userId, prof.id, {
        padSignOffByName: "Nicola Hartley",
        padSignOffLocation: "Ward 4, St Mary's",
        padSignOffDate: isoDay(Math.round(20 + rand() * 200)),
      });
    }
    // Evidence: alternate between reflections, shifts and med logs.
    if (i % 3 === 0 && reflectionIds.length) {
      await repo.createEvidenceLink({
        userId,
        proficiencyId: prof.id,
        evidenceType: "REFLECTION",
        evidenceId: reflectionIds[i % reflectionIds.length],
      });
      counts.evidenceLinks++;
    } else if (i % 3 === 1 && allShiftIds.length) {
      await repo.createEvidenceLink({
        userId,
        proficiencyId: prof.id,
        evidenceType: "SHIFT",
        evidenceId: allShiftIds[i % allShiftIds.length],
      });
      counts.evidenceLinks++;
    }
  }
  log(`  ${counts.proficiencies} proficiencies + ${counts.evidenceLinks} evidence links`);

  // ---- Revision: subjects, targets, topics, sessions. ----
  const subjects = seedSubjects;
  for (const group of REVISION_TOPICS) {
    const subject =
      subjects.find((s) =>
        s.name.toLowerCase().includes(group.subject.toLowerCase().slice(0, 8)),
      ) ?? subjects[0];
    if (!subject) break;
    await repo.createRevisionTarget({
      userId,
      subjectId: subject.id,
      type: group.subject === "acute" ? "OSCE" : "EXAM",
      title: `${subject.name} — final year assessment`,
      date: isoDay(-45 - Math.round(rand() * 40)), // still ahead
    });
    for (const title of group.topics) {
      const topic = await repo.createRevisionTopic({
        userId,
        subjectId: subject.id,
        title,
        confidence: 1 + Math.round(rand() * 4),
        lastReviewed: isoDay(Math.round(rand() * 40)),
      });
      for (let i = 0; i < 2; i++) {
        const daysAgo = Math.round(rand() * 80);
        await repo.createRevisionSession({
          userId,
          topicId: topic.id,
          method: i % 2 === 0 ? "SPACED_REPETITION" : "POMODORO",
          scheduledStart: isoAt(daysAgo, "18:00"),
          scheduledEnd: isoAt(daysAgo, "19:00"),
          completed: rand() > 0.25,
          confidenceAfter: 2 + Math.round(rand() * 3),
        });
        counts.revisionSessions++;
      }
    }
  }
  log(`  revision: ${counts.revisionSessions} sessions`);

  // ---- Self-care check-ins. NOTE: deliberately EXCLUDED from the AI corpus (D4) —
  // seeding them proves the exclusion holds in a populated account. ----
  for (let i = 0; i < 24; i++) {
    const energy = 2 + Math.round(rand() * 3);
    await repo.createSelfCareCheckin({
      userId,
      date: isoDay(i * 5),
      energy,
      items: SELF_CARE_ITEMS.filter(() => rand() > 0.45).join(",") || "sleep",
      note:
        i % 5 === 0
          ? "Long stretch of shifts this week — sleep has been the first thing to go. Booked a proper day off."
          : undefined,
    });
    counts.selfCareCheckins++;
  }

  // ---- Drug calculation practice. ----
  const calcDrills: Array<{ calcType: CalcType; prompt: string; answer: string }> = [
    {
      calcType: "TABLET_DOSE",
      prompt: "Prescribed 150 mg. Stock is 50 mg tablets. How many tablets?",
      answer: "3",
    },
    {
      calcType: "LIQUID_DOSE",
      prompt: "Prescribed 120 mg. Stock is 40 mg in 5 mL. What volume?",
      answer: "15 mL",
    },
    {
      calcType: "IV_RATE",
      prompt: "1000 mL over 8 hours. What rate in mL/hour?",
      answer: "125 mL/h",
    },
    {
      calcType: "WEIGHT_BASED",
      prompt: "5 mg/kg for a 68 kg adult. What total dose?",
      answer: "340 mg",
    },
    {
      calcType: "INFUSION_DROPS",
      prompt: "500 mL over 4 hours, giving set 20 drops/mL. Drops per minute?",
      answer: "42 drops/min",
    },
    { calcType: "UNIT_CONVERSION", prompt: "Convert 0.25 g to milligrams.", answer: "250 mg" },
  ];
  for (let i = 0; i < 18; i++) {
    const drill = calcDrills[i % calcDrills.length];
    await repo.createCalcDrill({
      userId,
      calcType: drill.calcType,
      prompt: drill.prompt,
      answer: drill.answer,
      lastAttempted: isoAt(Math.round(rand() * 60), "20:00"),
      lastCorrect: rand() > 0.25,
    });
    counts.calcDrills++;
  }

  log("  self-care, calc drills done");
  return counts;
}
