import { SKILL_STAGE_LABEL, type Skill, type SkillSignOff, type SkillStage } from "../domain/types";
import { annexeCodeOf } from "../data/seed/skills";
import { useRepository } from "./RepositoryContext";

/** A short, stable noun for a skill in the activity feed: its code, else its name. */
function skillNoun(skill: Skill): string {
  const code = annexeCodeOf(skill);
  if (code) return code;
  return skill.name.length > 48 ? skill.name.slice(0, 47).trimEnd() + "…" : skill.name;
}

/**
 * The single mutation point for clinical skills — every change goes through here and
 * appends the matching `LogItem` audit entry (the house rule: log at the action
 * layer, never in the repository). Mirrors `useShiftActions`. Callers reload after.
 */
export function useSkillActions() {
  const { repo, user } = useRepository();

  const log = async (entityId: string, action: string, summary: string, entityLabel: string) => {
    if (!user) return;
    await repo.createLogItem({
      userId: user.id,
      entityType: "SKILL",
      entityId,
      action,
      summary,
      entityLabel,
    });
  };

  const setStage = async (skill: Skill, stage: SkillStage) => {
    if (!user) return;
    const progress = await repo.setSkillStage(user.id, skill.id, stage);
    await log(
      skill.id,
      "SKILL_STAGE_CHANGED",
      `${skillNoun(skill)} marked ${SKILL_STAGE_LABEL[stage]}`,
      skillNoun(skill),
    );
    return progress;
  };

  /**
   * Sign a skill off (permanent). When `linkProficiency` is given (an Annexe B skill's
   * matching proficiency), also creates the `SKILL` evidence link so a sign-off feeds
   * the PAD in one step — logged against that proficiency too.
   */
  const signOff = async (
    skill: Skill,
    signOffData: SkillSignOff,
    linkProficiency?: { id: string; code: string },
  ) => {
    if (!user) return;
    const progress = await repo.signOffSkill(user.id, skill.id, signOffData);
    const by = signOffData.signOffByName ? ` by ${signOffData.signOffByName}` : "";
    await log(
      skill.id,
      "SKILL_SIGNED_OFF",
      `${skillNoun(skill)} signed off${by}`,
      skillNoun(skill),
    );
    if (linkProficiency) {
      await repo.createEvidenceLink({
        userId: user.id,
        proficiencyId: linkProficiency.id,
        evidenceType: "SKILL",
        evidenceId: skill.id,
      });
      await repo.createLogItem({
        userId: user.id,
        entityType: "PROFICIENCY",
        entityId: linkProficiency.id,
        entityLabel: linkProficiency.code,
        action: "EVIDENCE_LINKED",
        summary: `Linked a clinical skill as evidence for ${linkProficiency.code}`,
      });
    }
    return progress;
  };

  const addCustomSkill = async (input: { name: string; category: string }) => {
    if (!user) return;
    const skill = await repo.addCustomSkill(user.id, input);
    await log(skill.id, "SKILL_ADDED", `Added custom skill “${skill.name}”`, skillNoun(skill));
    return skill;
  };

  const deleteCustomSkill = async (skill: Skill) => {
    await repo.deleteCustomSkill(skill.id);
    await log(skill.id, "SKILL_DELETED", `Deleted custom skill “${skill.name}”`, skillNoun(skill));
  };

  return { setStage, signOff, addCustomSkill, deleteCustomSkill };
}
