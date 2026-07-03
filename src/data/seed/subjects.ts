import type { Subject } from "../../domain/types";

/**
 * Baseline revision subjects — global reference data (`userId: null`, shared by every
 * user, like the break-rule defaults and Annexe B skills). All the pre-registration
 * subjects **except bioscience** (per spec-revision-timetable). Ids are stable slugs so
 * integrations can reference them — notably `subject_numeracy`, which the weak-area view
 * ties to the medication calc-practice stats (`CalcStat`).
 */
export const seedSubjects: Subject[] = [
  { id: "subject_anatomy_physiology", userId: null, name: "Anatomy & physiology" },
  { id: "subject_pharmacology", userId: null, name: "Pharmacology" },
  { id: "subject_pathophysiology", userId: null, name: "Pathophysiology" },
  { id: "subject_nmc_theory", userId: null, name: "NMC theory" },
  { id: "subject_numeracy", userId: null, name: "Numeracy" },
  { id: "subject_osce_prep", userId: null, name: "OSCE prep" },
];

/** The baseline Numeracy subject id — the join point to the med calc-practice stats. */
export const NUMERACY_SUBJECT_ID = "subject_numeracy";
