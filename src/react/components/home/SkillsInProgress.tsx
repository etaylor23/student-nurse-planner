import { Link } from "react-router-dom";
import { useSkills } from "../../hooks";
import { SignedOffBadge, SkillStageBadge } from "../skills/shared";
import { Panel, btnGhostSm } from "../ui";

/**
 * "Skills in progress" — with the honesty fix from spec-home-redesign.md decision 10.
 *
 * The panel used to be titled "Skills in progress" while listing the three most
 * recently *touched* skills, so a student whose every skill was signed off saw three
 * green "Signed off" pills under a heading claiming they were in progress. Now the
 * list is genuinely in-progress work when there is any, and when there isn't it falls
 * back to recent sign-offs and the hint says so — the panel keeps its place on the
 * page without misdescribing what's in it.
 */
export function SkillsInProgress({ limit = 3 }: { limit?: number }) {
  const { skills, progress } = useSkills();
  const skillName = new Map(skills.map((s) => [s.id, s.name]));

  const byRecency = (a: { updatedAt: string }, b: { updatedAt: string }) =>
    a.updatedAt < b.updatedAt ? 1 : -1;

  const inProgress = progress.filter((p) => !p.signedOff).sort(byRecency);
  const signedOff = progress.filter((p) => p.signedOff).sort(byRecency);
  const showingFallback = inProgress.length === 0 && signedOff.length > 0;
  const rows = (showingFallback ? signedOff : inProgress).slice(0, limit);

  const hint = showingFallback
    ? `Nothing on the go — your ${rows.length === 1 ? "most recent sign-off" : `${rows.length} most recent sign-offs`}`
    : `${inProgress.length} on the go`;

  return (
    <Panel
      title="Skills in progress"
      hint={hint}
      action={
        <Link to="/skills" className={btnGhostSm}>
          All skills
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No skills started yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                to={`/skills/${p.skillId}`}
                className="flex items-center gap-2 py-2.5 transition first:pt-0 last:pb-0 hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {skillName.get(p.skillId) ?? "Skill"}
                </span>
                {p.signedOff ? <SignedOffBadge /> : <SkillStageBadge stage={p.stage} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
