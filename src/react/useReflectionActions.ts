import type {
  Proficiency,
  Reflection,
  ReflectionDraft,
  ReflectionSectionInput,
} from "../domain/types";
import { evidenceItem, useCapturePayoff } from "./components/CapturePayoff";
import { useRepository } from "./RepositoryContext";

/** A short, stable noun for a reflection in the activity feed: its title, truncated. */
function reflectionNoun(title: string): string {
  const t = title.trim() || "Untitled reflection";
  return t.length > 48 ? t.slice(0, 47).trimEnd() + "…" : t;
}

/**
 * The single mutation point for reflections — every change goes through here and
 * appends the matching `LogItem` audit entry (the house rule: log at the action
 * layer, never in the repository). Mirrors `useSkillActions`. Callers reload after.
 */
export function useReflectionActions() {
  const { repo, user } = useRepository();
  const { showPayoff } = useCapturePayoff();

  const log = async (id: string, action: string, summary: string, label: string) => {
    if (!user) return;
    await repo.createLogItem({
      userId: user.id,
      entityType: "REFLECTION",
      entityId: id,
      entityLabel: label,
      action,
      summary,
    });
  };

  const create = async (
    draft: ReflectionDraft,
    sections: ReflectionSectionInput[],
    tagLabels: string[] = [],
  ): Promise<Reflection | undefined> => {
    if (!user) return;
    const reflection = await repo.createReflection({ userId: user.id, ...draft }, sections);
    if (tagLabels.length > 0) await repo.setReflectionTags(user.id, reflection.id, tagLabels);
    await log(
      reflection.id,
      "REFLECTION_CREATED",
      `Wrote a reflection — “${reflectionNoun(reflection.title)}”`,
      reflectionNoun(reflection.title),
    );
    showPayoff("Reflection saved", [
      {
        key: `refl-${reflection.id}`,
        kind: "reflection",
        text: `“${reflectionNoun(reflection.title)}” — in your practice record. Link it to a proficiency to make it evidence.`,
        href: `/reflection/${reflection.id}`,
      },
    ]);
    return reflection;
  };

  const update = async (
    id: string,
    patch: Partial<ReflectionDraft>,
    sections?: ReflectionSectionInput[],
    tagLabels?: string[],
  ): Promise<Reflection | undefined> => {
    if (!user) return;
    const reflection = await repo.updateReflection(id, patch, sections);
    if (tagLabels) await repo.setReflectionTags(user.id, id, tagLabels);
    await log(
      id,
      "REFLECTION_UPDATED",
      `Updated the reflection “${reflectionNoun(reflection.title)}”`,
      reflectionNoun(reflection.title),
    );
    return reflection;
  };

  const remove = async (reflection: Reflection) => {
    if (!user) return;
    await repo.deleteReflection(reflection.id);
    await log(
      reflection.id,
      "REFLECTION_DELETED",
      `Deleted the reflection “${reflectionNoun(reflection.title)}”`,
      reflectionNoun(reflection.title),
    );
  };

  /**
   * Attach a reflection to a proficiency as `REFLECTION` evidence — logged against the
   * proficiency (like every other evidence link). The caller excludes already-linked
   * proficiencies, so this doesn't guard against duplicates.
   */
  const linkProficiency = async (reflection: Reflection, proficiency: Proficiency) => {
    if (!user) return;
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: proficiency.id,
      evidenceType: "REFLECTION",
      evidenceId: reflection.id,
    });
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: proficiency.id,
      entityLabel: proficiency.code,
      action: "EVIDENCE_LINKED",
      summary: `Linked a reflection as evidence for ${proficiency.code}`,
    });
    showPayoff("That's evidence", [evidenceItem(proficiency)]);
  };

  const unlinkProficiency = async (linkId: string, proficiency: Proficiency) => {
    if (!user) return;
    await repo.deleteEvidenceLink(linkId);
    await repo.createLogItem({
      userId: user.id,
      entityType: "PROFICIENCY",
      entityId: proficiency.id,
      entityLabel: proficiency.code,
      action: "EVIDENCE_UNLINKED",
      summary: `Removed a reflection from ${proficiency.code}`,
    });
  };

  return { create, update, remove, linkProficiency, unlinkProficiency };
}
