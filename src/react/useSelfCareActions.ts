import type { SelfCareCheckin, SelfCareCheckinDraft } from "../domain/types";
import { parseItems } from "../logic/selfCare";
import { useRepository } from "./RepositoryContext";

/**
 * The single mutation point for self-care check-ins — appends a `LogItem` at the action
 * layer (house rule). Kept gentle: the feed line is supportive, never a score/streak.
 */
export function useSelfCareActions() {
  const { repo, user } = useRepository();

  const addCheckin = async (draft: SelfCareCheckinDraft): Promise<SelfCareCheckin | undefined> => {
    if (!user) return;
    const checkin = await repo.createSelfCareCheckin({ userId: user.id, ...draft });
    const looked = parseItems(draft.items).length;
    const bits: string[] = [];
    if (draft.energy != null) bits.push(`energy ${draft.energy}/5`);
    if (looked > 0) bits.push(`${looked} thing${looked === 1 ? "" : "s"} looked after`);
    await repo.createLogItem({
      userId: user.id,
      entityType: "SELF_CARE",
      entityId: checkin.id,
      entityLabel: "Self-care check-in",
      action: "SELF_CARE_CHECKIN",
      summary: `Checked in on your wellbeing${bits.length ? ` — ${bits.join(", ")}` : ""}`,
    });
    return checkin;
  };

  const deleteCheckin = async (id: string) => {
    await repo.deleteSelfCareCheckin(id);
  };

  return { addCheckin, deleteCheckin };
}
