// Opt-in demo dataset. Populates every screen with a realistic part-2 student's
// worth of data — placements, shifts, medications + logs, competency progress +
// evidence, clinical-skill stages/sign-offs, custom skills and a rich activity feed —
// so the whole app (and the cross-surfacing added in U5/U6/U7/U11) can be explored
// without hand-entering anything. Triggered from the Profile page, never automatic.
//
// Everything is written THROUGH the Repository (the one storage seam) and mirrors the
// LogItems the action layer would have appended, so the feed reads like real history.
import type { Repository } from "../repository";
import {
  MED_LOG_TYPE_LABEL,
  PROFICIENCY_STATUS_LABEL,
  SKILL_STAGE_LABEL,
  type CalcType,
  type GibbsStage,
  type MedLogType,
  type ProficiencyStatus,
  type ShiftType,
  type SkillStage,
} from "../../domain/types";
import { defaultBreakRules } from "../../logic/breakRules";
import { formatHumanDate, isoDate } from "../../logic/calendar";
import { computeNetHours } from "../../logic/hours";

/** Has this browser already got user content (demo or real)? Guards re-seeding. */
export async function hasDemoData(repo: Repository, userId: string): Promise<boolean> {
  const [placements, shifts, meds] = await Promise.all([
    repo.listPlacements(userId),
    repo.listShifts(userId),
    repo.listMedications(userId),
  ]);
  return placements.length > 0 || shifts.length > 0 || meds.length > 0;
}

/**
 * Fill the store with the sample dataset. No-ops if any user content already exists,
 * so a double-click can't create duplicates. Sequential on purpose — the activity
 * feed's order follows insertion order.
 */
export async function seedDemoData(repo: Repository, userId: string): Promise<void> {
  if (await hasDemoData(repo, userId)) return;

  const now = new Date();
  const rules = defaultBreakRules();
  /** A Date `daysAgo` days before now (negative = future), at local `h:m`. */
  const at = (daysAgo: number, h = 0, m = 0): Date => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // Feed specs, collected in chronological order and written last so every entityId
  // already resolves. Each mirrors what the matching action-layer hook would log.
  const feed: Array<{
    entityType: string;
    entityId: string;
    action: string;
    summary: string;
    entityLabel?: string;
  }> = [];

  // ---- Profile: a second-year adult-field student ----
  await repo.updateUser({
    displayName: "Alex Rivera",
    programmeType: "BSC_3YR",
    currentPart: 2,
    totalParts: 3,
    startDate: isoDate(at(540, 9, 0)),
    targetRegistrationDate: isoDate(at(-540, 9, 0)),
  });
  feed.push({
    entityType: "PROFILE",
    entityId: userId,
    action: "PROFILE_UPDATED",
    summary: "Updated profile — part 2 of 3, BSc (3 years)",
    entityLabel: "Profile",
  });

  // ---- Placements ----
  const p1 = await repo.createPlacement({
    userId,
    name: "Ward 12 — Acute Medical Unit",
    settingType: "Acute inpatient",
  });
  const p2 = await repo.createPlacement({
    userId,
    name: "Riverside Community Nursing",
    settingType: "Community",
  });
  const p3 = await repo.createPlacement({
    userId,
    name: "Emergency Department",
    settingType: "Acute",
  });

  // ---- Shifts (mostly worked, a couple planned, one simulated) ----
  interface ShiftSpec {
    place?: { id: string; name: string };
    daysAgo: number;
    startH: number;
    startM: number;
    endH: number;
    endM: number;
    type: ShiftType;
    status: "PLANNED" | "COMPLETED";
    simulated?: boolean;
    rn?: string;
    notes?: string;
  }
  const addShift = async (s: ShiftSpec) => {
    const start = at(s.daysAgo, s.startH, s.startM);
    const end = at(s.daysAgo, s.endH, s.endM);
    if (end <= start) end.setDate(end.getDate() + 1); // overnight
    const rawDurationMins = Math.round((end.getTime() - start.getTime()) / 60000);
    const { netHours, breakMins } = computeNetHours({ entryMode: "RAW", rawDurationMins }, rules);
    const shift = await repo.createShift({
      userId,
      placementId: s.place?.id,
      date: isoDate(start),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      shiftType: s.type,
      entryMode: "RAW",
      rawDurationMins,
      breakMins,
      netHours,
      isSimulated: !!s.simulated,
      status: s.status,
      supervisingRnName: s.status === "COMPLETED" ? s.rn : undefined,
      notes: s.notes,
    });
    const label = `${s.place?.name ?? (s.simulated ? "Simulation" : "No placement")} · ${formatHumanDate(shift.date)}`;
    feed.push(
      s.status === "COMPLETED"
        ? {
            entityType: "SHIFT",
            entityId: shift.id,
            action: "SHIFT_COMPLETED",
            summary: `Marked the ${formatHumanDate(shift.date)} shift as worked${s.rn ? ` (with ${s.rn})` : ""}`,
            entityLabel: label,
          }
        : {
            entityType: "SHIFT",
            entityId: shift.id,
            action: "SHIFT_CREATED",
            summary: `Logged a shift on ${formatHumanDate(shift.date)}`,
            entityLabel: label,
          },
    );
    return shift;
  };

  const s1 = await addShift({ place: p1, daysAgo: 30, startH: 7, startM: 30, endH: 20, endM: 0, type: "LONG_DAY", status: "COMPLETED", rn: "Sr. Okafor" }); // prettier-ignore
  await addShift({ place: p1, daysAgo: 28, startH: 7, startM: 30, endH: 20, endM: 0, type: "LONG_DAY", status: "COMPLETED", rn: "Sr. Okafor" }); // prettier-ignore
  await addShift({ place: p1, daysAgo: 25, startH: 7, startM: 0, endH: 15, endM: 0, type: "EARLY", status: "COMPLETED", rn: "Sr. Okafor" }); // prettier-ignore
  await addShift({ daysAgo: 23, startH: 9, startM: 0, endH: 17, endM: 0, type: "LONG_DAY", status: "COMPLETED", simulated: true, rn: "Simulation lead", notes: "Deteriorating-patient simulation suite." }); // prettier-ignore
  const s2 = await addShift({ place: p2, daysAgo: 21, startH: 8, startM: 0, endH: 18, endM: 0, type: "LONG_DAY", status: "COMPLETED", rn: "CN Bradley" }); // prettier-ignore
  await addShift({ place: p2, daysAgo: 18, startH: 8, startM: 0, endH: 16, endM: 0, type: "EARLY", status: "COMPLETED", rn: "CN Bradley" }); // prettier-ignore
  const s3 = await addShift({ place: p3, daysAgo: 14, startH: 8, startM: 0, endH: 20, endM: 30, type: "LONG_DAY", status: "COMPLETED", rn: "Sr. Patel" }); // prettier-ignore
  await addShift({ place: p3, daysAgo: 12, startH: 20, startM: 0, endH: 8, endM: 0, type: "NIGHT", status: "COMPLETED", rn: "Sr. Patel" }); // prettier-ignore
  await addShift({ place: p1, daysAgo: 9, startH: 7, startM: 30, endH: 20, endM: 0, type: "LONG_DAY", status: "COMPLETED", rn: "Sr. Okafor" }); // prettier-ignore
  await addShift({ place: p3, daysAgo: 6, startH: 13, startM: 0, endH: 21, endM: 0, type: "LATE", status: "COMPLETED", rn: "Sr. Patel" }); // prettier-ignore
  await addShift({ place: p2, daysAgo: 3, startH: 8, startM: 0, endH: 16, endM: 0, type: "EARLY", status: "COMPLETED", rn: "CN Bradley" }); // prettier-ignore
  await addShift({ place: p1, daysAgo: -2, startH: 7, startM: 30, endH: 20, endM: 0, type: "LONG_DAY", status: "PLANNED" }); // prettier-ignore
  await addShift({ place: p3, daysAgo: -5, startH: 13, startM: 0, endH: 21, endM: 0, type: "LATE", status: "PLANNED" }); // prettier-ignore

  // ---- Medications (study cards) + their conditions ----
  const mkMed = async (
    m: {
      name: string;
      drugClass: string;
      bodySystem: string;
      routes: string;
      mechanismOfAction?: string;
      sideEffects?: string;
      monitoring?: string;
      keyNotes?: string;
      highAlert?: boolean;
    },
    conditions: string[],
  ) => {
    const med = await repo.createMedication({ userId, ...m });
    for (const c of conditions) await repo.addMedicationCondition(med.id, c);
    feed.push({
      entityType: "MEDICATION",
      entityId: med.id,
      action: "MEDICATION_ADDED",
      summary: `Added ${med.name} to your medications`,
      entityLabel: med.name,
    });
    return med;
  };

  const paracetamol = await mkMed(
    {
      name: "Paracetamol",
      drugClass: "Non-opioid analgesic",
      bodySystem: "Central nervous system",
      routes: "Oral, IV, Rectal",
      mechanismOfAction: "Poorly understood; thought to inhibit central prostaglandin synthesis.",
      sideEffects: "Rare at therapeutic dose, Hepatotoxicity in overdose",
      monitoring: "Liver function (overdose / low body weight)",
      keyNotes: "Max 4 g / 24 h in adults; reduce in low body weight and hepatic impairment.",
    },
    ["Pain", "Pyrexia"],
  );
  const amoxicillin = await mkMed(
    {
      name: "Amoxicillin",
      drugClass: "Penicillin antibiotic",
      bodySystem: "Infection",
      routes: "Oral, IV",
      mechanismOfAction: "Inhibits bacterial cell-wall synthesis.",
      sideEffects: "Nausea, Diarrhoea, Rash",
      monitoring: "Signs of allergy, Renal function",
      keyNotes: "Check penicillin allergy before administration.",
    },
    ["Chest infection", "Urinary tract infection"],
  );
  const furosemide = await mkMed(
    {
      name: "Furosemide",
      drugClass: "Loop diuretic",
      bodySystem: "Cardiovascular",
      routes: "Oral, IV",
      mechanismOfAction: "Inhibits Na/K/2Cl co-transport in the loop of Henle.",
      sideEffects: "Hypokalaemia, Dehydration, Hypotension",
      monitoring: "U&E, Fluid balance, Weight, Blood pressure",
      keyNotes: "Monitor potassium; can cause postural hypotension.",
    },
    ["Heart failure", "Pulmonary oedema"],
  );
  const enoxaparin = await mkMed(
    {
      name: "Enoxaparin",
      drugClass: "Low molecular weight heparin",
      bodySystem: "Haematology",
      routes: "Subcutaneous",
      mechanismOfAction: "Potentiates antithrombin III, inhibiting factor Xa.",
      sideEffects: "Bleeding, Bruising, Thrombocytopenia",
      monitoring: "Anti-Xa (if indicated), Platelets, Renal function",
      keyNotes: "Dose by weight and renal function.",
      highAlert: true,
    },
    ["VTE prophylaxis"],
  );
  const salbutamol = await mkMed(
    {
      name: "Salbutamol",
      drugClass: "Short-acting beta-2 agonist",
      bodySystem: "Respiratory",
      routes: "Inhaled, Nebulised, IV",
      mechanismOfAction: "Beta-2 receptor agonist relaxing bronchial smooth muscle.",
      sideEffects: "Tremor, Tachycardia, Hypokalaemia",
      monitoring: "Heart rate, Potassium (high/repeated doses)",
    },
    ["Asthma", "COPD exacerbation"],
  );
  const insulin = await mkMed(
    {
      name: "Insulin (human, soluble)",
      drugClass: "Insulin",
      bodySystem: "Endocrine",
      routes: "Subcutaneous, IV",
      mechanismOfAction: "Promotes cellular glucose uptake and inhibits gluconeogenesis.",
      sideEffects: "Hypoglycaemia, Weight gain",
      monitoring: "Blood glucose, Potassium (IV)",
      keyNotes: "Never abbreviate 'units'. Double-check with a second nurse.",
      highAlert: true,
    },
    ["Type 1 diabetes", "Diabetic ketoacidosis"],
  );

  // A couple of numeracy drills on paracetamol so its detail isn't empty.
  await repo.createCalcDrill({
    userId,
    medicationId: paracetamol.id,
    calcType: "TABLET_DOSE",
    prompt: "500 mg is prescribed. Tablets are 500 mg. How many tablets? (illustrative)",
    answer: "1 tablet",
  });
  await repo.createCalcDrill({
    userId,
    medicationId: paracetamol.id,
    calcType: "LIQUID_DOSE",
    prompt: "120 mg needed; suspension is 120 mg/5 mL. What volume? (illustrative)",
    answer: "5 mL",
  });

  // ---- Medication logs (linked to the shift they happened in) ----
  const mkLog = async (
    med: { id: string; name: string },
    shift: { id: string } | undefined,
    place: { name: string } | undefined,
    type: MedLogType,
    daysAgo: number,
    route: string,
  ) => {
    const log = await repo.createMedicationLog({
      userId,
      medicationId: med.id,
      shiftId: shift?.id,
      type,
      date: isoDate(at(daysAgo)),
      route,
    });
    feed.push({
      entityType: "MEDICATION_LOG",
      entityId: log.id,
      action: "MED_LOGGED",
      summary: `${MED_LOG_TYPE_LABEL[type]} ${med.name}${place ? ` in ${place.name}` : ""}`,
      entityLabel: med.name,
    });
    return log;
  };

  // Paracetamol logged 6× (so its detail shows "+N more in the med log").
  const paraLog = await mkLog(paracetamol, s1, p1, "ADMINISTERED", 30, "Oral");
  await mkLog(paracetamol, s1, p1, "OBSERVED", 30, "IV");
  await mkLog(paracetamol, s3, p3, "ADMINISTERED", 14, "Oral");
  await mkLog(paracetamol, s3, p3, "ADMINISTERED", 14, "IV");
  await mkLog(paracetamol, s2, p2, "OBSERVED", 21, "Oral");
  await mkLog(paracetamol, s1, p1, "ADMINISTERED", 28, "Oral");
  // Other meds across placements (drives the per-placement med counts).
  await mkLog(amoxicillin, s1, p1, "ADMINISTERED", 30, "IV");
  await mkLog(amoxicillin, s2, p2, "OBSERVED", 21, "Oral");
  const furoLog = await mkLog(furosemide, s1, p1, "ADMINISTERED", 25, "IV");
  await mkLog(furosemide, s3, p3, "OBSERVED", 14, "IV");
  await mkLog(enoxaparin, s1, p1, "OBSERVED", 30, "Subcutaneous");
  await mkLog(salbutamol, s3, p3, "ADMINISTERED", 14, "Nebulised");
  await mkLog(salbutamol, s3, p3, "OBSERVED", 12, "Nebulised");
  await mkLog(insulin, s1, p1, "OBSERVED", 28, "Subcutaneous");

  // ---- Numeracy accuracy (drives the "Your numeracy" panel + 4.14 / B11.4) ----
  const attempts: Array<[CalcType, number, number]> = [
    ["TABLET_DOSE", 9, 8],
    ["LIQUID_DOSE", 6, 5],
    ["IV_RATE", 5, 3],
    ["WEIGHT_BASED", 4, 3],
    ["INFUSION_DROPS", 3, 2],
  ];
  for (const [type, total, correct] of attempts) {
    for (let i = 0; i < total; i++) await repo.recordCalcAttempt(userId, type, i < correct);
  }

  // ---- Competency progress + dated history ----
  const profs = await repo.listProficiencies();
  const profByCode = new Map(profs.map((p) => [p.code, p.id]));
  const setStatus = async (
    code: string,
    status: ProficiencyStatus,
    part: number,
    daysAgo: number,
    assessor: string | undefined,
    targetPart?: number,
  ) => {
    const id = profByCode.get(code);
    if (!id) return;
    await repo.setProficiencyStatus(userId, id, {
      status,
      partIndex: part,
      occurredAt: isoDate(at(daysAgo)),
      assessorName: assessor,
    });
    if (targetPart != null) await repo.setProficiencyTargetPart(userId, id, targetPart);
    feed.push({
      entityType: "PROFICIENCY",
      entityId: id,
      action: "PROFICIENCY_STATUS_CHANGED",
      summary: `${code} marked ${PROFICIENCY_STATUS_LABEL[status]} (Part ${part})`,
      entityLabel: code,
    });
  };

  // Achieved across a spread of platforms + Annexe B.
  await setStatus("1.1", "ACHIEVED", 1, 120, "Sr. Okafor");
  await setStatus("1.2", "ACHIEVED", 1, 118, "Sr. Okafor");
  await setStatus("2.1", "ACHIEVED", 2, 40, "CN Bradley");
  await setStatus("3.1", "ACHIEVED", 2, 38, "CN Bradley");
  await setStatus("6.1", "ACHIEVED", 2, 22, "Sr. Patel");
  await setStatus("B2.1", "ACHIEVED", 2, 30, "Sr. Okafor");
  await setStatus("B2.10", "ACHIEVED", 2, 26, "Sr. Okafor");
  await setStatus("B7.1", "ACHIEVED", 2, 20, "Sr. Patel");
  // Developing.
  await setStatus("4.1", "DEVELOPING", 2, 15, "Sr. Patel");
  await setStatus("4.2", "DEVELOPING", 2, 14, "Sr. Patel");
  await setStatus("B4.1", "DEVELOPING", 2, 12, "CN Bradley");
  // Developing AND target part 2 → these surface as (escalating) gaps.
  await setStatus("4.14", "DEVELOPING", 2, 10, "Sr. Patel", 2);
  await setStatus("B11.4", "DEVELOPING", 2, 9, "Sr. Patel", 2);
  // Not yet achieved but due → gaps.
  await setStatus("4.4", "NOT_YET_ACHIEVED", 2, 8, undefined, 2);
  await setStatus("B2.13", "NOT_YET_ACHIEVED", 2, 7, undefined, 2);
  await setStatus("2.5", "NOT_YET_ACHIEVED", 1, 45, undefined, 1);

  // ---- Evidence links (shift + med-log evidence; feed EVIDENCE_LINKED) ----
  const linkEvidence = async (
    code: string,
    evidenceType: "SHIFT" | "MED_LOG" | "SKILL",
    evidenceId: string,
    noun: string,
  ) => {
    const pid = profByCode.get(code);
    if (!pid) return;
    await repo.createEvidenceLink({ userId, proficiencyId: pid, evidenceType, evidenceId });
    feed.push({
      entityType: "PROFICIENCY",
      entityId: pid,
      action: "EVIDENCE_LINKED",
      summary: `Linked a ${noun} as evidence for ${code}`,
      entityLabel: code,
    });
  };
  await linkEvidence("1.1", "SHIFT", s1.id, "placement shift");
  await linkEvidence("2.1", "SHIFT", s2.id, "placement shift");
  await linkEvidence("4.4", "SHIFT", s3.id, "placement shift");
  await linkEvidence("4.1", "MED_LOG", paraLog.id, "medication log");
  await linkEvidence("4.2", "MED_LOG", furoLog.id, "medication log");

  // ---- Clinical skills: stages, sign-offs, custom skills ----
  const skills = await repo.listSkills(userId);
  const skillIds = new Set(skills.map((s) => s.id));
  const shortSkill = (code: string) => code; // feed noun for a baseline skill = its code

  const stageSkill = async (code: string, stage: SkillStage) => {
    const id = `skill_${code}`;
    if (!skillIds.has(id)) return;
    await repo.setSkillStage(userId, id, stage);
    feed.push({
      entityType: "SKILL",
      entityId: id,
      action: "SKILL_STAGE_CHANGED",
      summary: `${shortSkill(code)} marked ${SKILL_STAGE_LABEL[stage]}`,
      entityLabel: shortSkill(code),
    });
  };
  await stageSkill("B2.2", "OBSERVED");
  await stageSkill("B2.5", "ASSISTED");
  await stageSkill("B7.1", "ASSISTED");

  // Sign off two baseline skills, auto-linking each to its 1:1 proficiency and the
  // shift it happened in (U8) so the shift editor's "Skills signed off" list populates.
  const signOffBaseline = async (
    code: string,
    by: string,
    where: string,
    daysAgo: number,
    shiftId: string,
  ) => {
    const id = `skill_${code}`;
    if (!skillIds.has(id)) return;
    await repo.setSkillStage(userId, id, "PERFORMED_UNDER_SUPERVISION");
    await repo.signOffSkill(userId, id, {
      signOffByName: by,
      signOffLocation: where,
      signOffDate: isoDate(at(daysAgo)),
      evidenceNote: "Directly observed on placement.",
      shiftId,
    });
    feed.push({
      entityType: "SKILL",
      entityId: id,
      action: "SKILL_SIGNED_OFF",
      summary: `${shortSkill(code)} signed off by ${by}`,
      entityLabel: shortSkill(code),
    });
    const pid = profByCode.get(code);
    if (pid) {
      await repo.createEvidenceLink({
        userId,
        proficiencyId: pid,
        evidenceType: "SKILL",
        evidenceId: id,
      });
      feed.push({
        entityType: "PROFICIENCY",
        entityId: pid,
        action: "EVIDENCE_LINKED",
        summary: `Linked a clinical skill as evidence for ${code}`,
        entityLabel: code,
      });
    }
  };
  await signOffBaseline("B2.1", "Sr. Okafor", "Ward 12 — Acute Medical Unit", 30, s1.id);
  await signOffBaseline("B2.10", "Sr. Okafor", "Ward 12 — Acute Medical Unit", 26, s1.id);

  // Custom skills — one linked to a proficiency as evidence (U7).
  const addCustom = async (name: string, category: string, stage?: SkillStage) => {
    const skill = await repo.addCustomSkill(userId, { name, category });
    feed.push({
      entityType: "SKILL",
      entityId: skill.id,
      action: "SKILL_ADDED",
      summary: `Added custom skill “${skill.name}”`,
      entityLabel: skill.name,
    });
    if (stage) {
      await repo.setSkillStage(userId, skill.id, stage);
      feed.push({
        entityType: "SKILL",
        entityId: skill.id,
        action: "SKILL_STAGE_CHANGED",
        summary: `${skill.name} marked ${SKILL_STAGE_LABEL[stage]}`,
        entityLabel: skill.name,
      });
    }
    return skill;
  };
  await addCustom("Insulin pump set-up", "Diabetes care", "ASSISTED");
  await addCustom("Syringe driver management", "Palliative care", "OBSERVED");
  const ecgSkill = await addCustom("12-lead ECG placement", "Cardiac monitoring", "ASSISTED");
  // Link the custom ECG skill to the ECG proficiency (B2.3) as evidence.
  const ecgProf = profByCode.get("B2.3");
  if (ecgProf) {
    await repo.createEvidenceLink({
      userId,
      proficiencyId: ecgProf,
      evidenceType: "SKILL",
      evidenceId: ecgSkill.id,
    });
    feed.push({
      entityType: "PROFICIENCY",
      entityId: ecgProf,
      action: "EVIDENCE_LINKED",
      summary: "Linked a clinical skill as evidence for B2.3",
      entityLabel: "B2.3",
    });
  }

  // ---- Reflections (Gibbs; linked to shifts + attached as evidence) ----
  const mkReflection = async (r: {
    title: string;
    daysAgo: number;
    shiftId?: string;
    isLocked?: boolean;
    tags: string[];
    sections: Partial<Record<GibbsStage, string>>;
    evidenceCodes?: string[];
  }) => {
    const sections = (Object.entries(r.sections) as [GibbsStage, string][]).map(
      ([stage, content]) => ({ stage, content }),
    );
    const reflection = await repo.createReflection(
      {
        userId,
        title: r.title,
        model: "GIBBS",
        occurredOn: isoDate(at(r.daysAgo)),
        shiftId: r.shiftId,
        isLocked: !!r.isLocked,
        piiAcknowledged: true,
      },
      sections,
    );
    if (r.tags.length > 0) await repo.setReflectionTags(userId, reflection.id, r.tags);
    feed.push({
      entityType: "REFLECTION",
      entityId: reflection.id,
      action: "REFLECTION_CREATED",
      summary: `Wrote a reflection — “${reflection.title}”`,
      entityLabel: reflection.title,
    });
    for (const code of r.evidenceCodes ?? []) {
      const pid = profByCode.get(code);
      if (!pid) continue;
      await repo.createEvidenceLink({
        userId,
        proficiencyId: pid,
        evidenceType: "REFLECTION",
        evidenceId: reflection.id,
      });
      feed.push({
        entityType: "PROFICIENCY",
        entityId: pid,
        action: "EVIDENCE_LINKED",
        summary: `Linked a reflection as evidence for ${code}`,
        entityLabel: code,
      });
    }
    return reflection;
  };

  // A complete reflection off the ED shift, attached to two proficiencies as evidence.
  await mkReflection({
    title: "Escalating a deteriorating patient",
    daysAgo: 14,
    shiftId: s3.id,
    tags: ["escalation", "safety", "communication"],
    evidenceCodes: ["6.1", "1.1"],
    sections: {
      DESCRIPTION:
        "On a busy ED shift a patient's NEWS2 rose to 7. I flagged it to my supervising nurse and we escalated to the medical team.",
      FEELINGS: "Anxious about interrupting a busy team, but I knew I had to speak up.",
      EVALUATION:
        "Escalating early meant a quick review. I hesitated for a minute, which I'd like to shorten.",
      ANALYSIS:
        "Structured tools like NEWS2 and SBAR gave me the language and confidence to escalate clearly.",
      CONCLUSION: "Speaking up promptly is part of safe practice — my hesitation was about not wanting to seem wrong.", // prettier-ignore
      ACTION_PLAN:
        "Practise SBAR handovers and remind myself that raising a concern is always appropriate.",
    },
  });

  // A partially-written reflection on a medication skill, evidencing a Platform 4 gap.
  await mkReflection({
    title: "First subcutaneous injection under supervision",
    daysAgo: 30,
    shiftId: s1.id,
    tags: ["medication", "skills"],
    evidenceCodes: ["4.1"],
    sections: {
      DESCRIPTION: "I gave my first subcutaneous injection under supervision on Ward 12.",
      FEELINGS: "Nervous about my technique but reassured by my assessor.",
      EVALUATION: "Preparation went well; I need to be smoother with the injection angle.",
      ACTION_PLAN: "Rehearse the technique and read up on injection sites.",
    },
  });

  // A locked, private wellbeing reflection with no shift link (demonstrates the lock).
  await mkReflection({
    title: "Staying on top of study around placement",
    daysAgo: 9,
    isLocked: true,
    tags: ["time-management", "wellbeing"],
    sections: {
      DESCRIPTION: "A run of long days left me exhausted and behind on my own study.",
      FEELINGS: "Overwhelmed, and guilty about not keeping up.",
      ACTION_PLAN: "Block protected study time around my shifts and talk to my academic advisor.",
    },
  });

  // ---- Write the activity feed last (chronological insertion order) ----
  for (const f of feed) {
    await repo.createLogItem({ userId, ...f });
  }
}
