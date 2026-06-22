import { useState } from "react";
import type { ProgrammeType, User } from "../../domain/types";
import { useRepository } from "../RepositoryContext";
import { PageHero, Panel, btnPrimary, inputCls } from "./ui";

const PROGRAMME_TYPE_LABEL: Record<ProgrammeType, string> = {
  BSC_3YR: "BSc (3 years)",
  MSC_2YR: "MSc (2 years)",
  APPRENTICE: "Nursing apprenticeship",
  OTHER: "Other",
};

/** Profile / settings: edits the single `User`. Reuses getCurrentUser/updateUser. */
export function ProfilePage() {
  const { user, loading } = useRepository();
  if (loading || !user) {
    return (
      <div className="space-y-6">
        <PageHero eyebrow="Account" title="Your profile" />
        <Panel title="Profile">
          <p className="text-sm text-slate-400">Loading…</p>
        </Panel>
      </div>
    );
  }
  return <ProfileForm key={user.id} user={user} />;
}

function ProfileForm({ user }: { user: User }) {
  const { repo, reloadUser } = useRepository();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [programmeType, setProgrammeType] = useState<ProgrammeType>(user.programmeType);
  const [currentPart, setCurrentPart] = useState(String(user.currentPart));
  const [totalParts, setTotalParts] = useState(String(user.totalParts));
  const [startDate, setStartDate] = useState(user.startDate ?? "");
  const [targetRegistrationDate, setTargetRegistrationDate] = useState(
    user.targetRegistrationDate ?? "",
  );
  const [saved, setSaved] = useState(false);

  const total = Number(totalParts);
  const current = Number(currentPart);
  const error =
    !Number.isInteger(total) || total < 1
      ? "Total parts must be a whole number of at least 1."
      : !Number.isInteger(current) || current < 1 || current > total
        ? `Current part must be between 1 and ${total || 1}.`
        : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error) return;
    await repo.updateUser({
      displayName: displayName.trim() || "Me",
      programmeType,
      currentPart: current,
      totalParts: total,
      startDate: startDate || undefined,
      targetRegistrationDate: targetRegistrationDate || undefined,
    });
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFILE",
      entityId: user.id,
      entityLabel: "Profile",
      action: "PROFILE_UPDATED",
      summary: `Updated profile — part ${current} of ${total}, ${PROGRAMME_TYPE_LABEL[programmeType]}`,
    });
    await reloadUser();
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Account"
        title="Your profile"
        subtitle="Your programme details. The current part drives the competency tracker's gap warnings."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          step="1"
          title="Programme"
          hint="Used across the app for hours and competency targets"
          className="xl:col-span-2"
        >
          <form onSubmit={submit} onChange={() => setSaved(false)} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputCls}
                placeholder="Your name"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Field of nursing
                </span>
                <select value="ADULT" disabled className={inputCls + " cursor-not-allowed"}>
                  <option value="ADULT">Adult</option>
                </select>
                <span className="mt-1 block text-xs text-slate-400">
                  Adult-field only for now; other fields come later.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Programme</span>
                <select
                  value={programmeType}
                  onChange={(e) => setProgrammeType(e.target.value as ProgrammeType)}
                  className={inputCls}
                >
                  {(Object.keys(PROGRAMME_TYPE_LABEL) as ProgrammeType[]).map((p) => (
                    <option key={p} value={p}>
                      {PROGRAMME_TYPE_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Current part
                </span>
                <input
                  type="number"
                  min={1}
                  max={total || undefined}
                  value={currentPart}
                  onChange={(e) => setCurrentPart(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Total parts</span>
                <input
                  type="number"
                  min={1}
                  value={totalParts}
                  onChange={(e) => setTotalParts(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Target registration
                </span>
                <input
                  type="date"
                  value={targetRegistrationDate}
                  onChange={(e) => setTargetRegistrationDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" className={btnPrimary} disabled={!!error}>
                Save profile
              </button>
              {saved && <span className="text-sm text-emerald-700">Saved.</span>}
            </div>
          </form>
        </Panel>

        <Panel title="Why this matters" hint="How your part is used">
          <p className="text-sm leading-relaxed text-slate-600">
            Your <span className="font-medium text-slate-800">current part</span> tells the NMC
            competency tracker which proficiencies should already be evidenced. Proficiencies that
            aren't yet achieved are surfaced as gaps, and warnings escalate as you reach the part a
            proficiency is tagged for — or your final part if it isn't tagged.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Your PAD remains the official signed record. This is a personal study aid.
          </p>
        </Panel>
      </div>
    </div>
  );
}
