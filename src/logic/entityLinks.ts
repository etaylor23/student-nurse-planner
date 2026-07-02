/**
 * Route resolution for a logged entity — turns the `entityType` + `entityId` an
 * activity-feed entry carries into the in-app route that opens it. Pure so it can be
 * shared by the feed (`LogList`) and unit-tested. Returns `null` for entity types
 * with no destination, so callers can render those rows as plain (non-clickable) text.
 */
export function hrefForEntity(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "SHIFT":
      return `/planner/${entityId}`;
    case "PROFICIENCY":
      return `/competencies/proficiency/${entityId}`;
    case "SKILL":
      return `/skills/${entityId}`;
    case "MEDICATION":
      return `/medications/${entityId}`;
    // The feed doesn't carry a med log's medication id, so we can't deep-link to the
    // med here — land on the log instead (the router's catch-all handles a stale id).
    case "MEDICATION_LOG":
      return "/medications/log";
    case "PROFILE":
      return "/profile";
    default:
      return null;
  }
}
