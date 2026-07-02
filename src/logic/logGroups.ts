import type { LogItem } from "../domain/types";

/** A set of log entries written together in one save event (same `batchId`),
 * or a lone entry. Rendered as one row in the activity feed / history. */
export interface LogGroup {
  key: string;
  entityType: string; // the kind of entity this group is about (from its entries)
  entityId: string;
  entityLabel?: string;
  at: string; // the group's timestamp (latest entry)
  entries: LogItem[];
}

/**
 * Group log entries by save event. Entries sharing a `batchId` (the field changes
 * from one save) collapse into one group; entries without a `batchId` (creates,
 * completes, deletes, and pre-existing entries) are their own group. Input is
 * newest-first; groups come back newest-first by their first appearance.
 */
export function groupLogItems(items: LogItem[]): LogGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, LogGroup>();
  for (const it of items) {
    const key = it.batchId ?? it.id;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        entityType: it.entityType,
        entityId: it.entityId,
        entityLabel: it.entityLabel,
        at: it.createdAt,
        entries: [],
      };
      byKey.set(key, g);
      order.push(key);
    }
    g.entries.push(it);
    if (it.createdAt > g.at) g.at = it.createdAt;
  }
  return order.map((k) => byKey.get(k)!);
}
