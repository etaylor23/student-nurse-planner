import { PageHero, Panel } from "./ui";

/** Planned screens, from spec-medication-notes.md. */
const PLANNED = [
  {
    title: "Medication list",
    body: "Search and filter by drug class, body system or condition.",
  },
  {
    title: "Medication detail",
    body: "BNF-style notes with optional class / system / routes; append a condition over time.",
  },
  {
    title: "Add a medication",
    body: "Capturing a new med triggers a generic numeracy calc drill.",
  },
  {
    title: "Calc practice",
    body: "Flashcards by type (tablet / liquid / IV rate / weight-based) — illustrative numbers only.",
  },
  {
    title: "Med log",
    body: "Record meds observed or administered — never any patient-identifiable info.",
  },
];

/**
 * Scaffold for Medication Notes. The feature is being built; this previews the
 * planned screens and keeps the study-tool safety framing front and centre.
 */
export function MedicationNotesPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Study aid"
        title="Medication notes"
        subtitle="A revision reference and a personal log of meds you've observed or administered."
      />

      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
        <span className="font-semibold">Study tool only.</span> This is for learning — never a
        clinical dosing reference, and it holds no patient-identifiable information.
      </div>

      <Panel title="What's coming" hint="We're building this out next">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLANNED.map((s) => (
            <li
              key={s.title}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-800">{s.title}</p>
              <p className="mt-1 text-sm text-slate-500">{s.body}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
