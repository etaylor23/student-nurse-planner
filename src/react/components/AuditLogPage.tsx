import { ActivityLog } from "./ActivityLog";
import { PageHero } from "./ui";

/**
 * The full audit log (spec-home-redesign.md decision 9) — every recorded change, with
 * the area filters that used to sit on Home.
 *
 * Home carries a six-row digest now; the filter tabs and the unbounded list are here,
 * where someone actually looking for a specific change can use them. Nothing about the
 * data changed: same `listLogItems`, same entries, same grouping. Deleted shifts keep
 * their entries here even though they're gone from the calendar, and asking your notes
 * appears here too (the digest drops it, this doesn't) — the log's whole job is to be
 * complete.
 */
export function AuditLogPage() {
  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Your record"
        title="Activity log"
        subtitle="Every change PlaceMate has recorded, newest first. Your PAD stays the official signed record — this is your own running history of what you did."
      />
      <ActivityLog title="All entries" hint="Filter by area" />
    </div>
  );
}
