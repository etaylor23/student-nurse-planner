import { useCallback, useSyncExternalStore } from "react";
import { useRepository } from "./RepositoryContext";
import { SyncRepository, type SyncStatus } from "../data/sync/syncRepository";

// Stable no-op references for the guest case, so useSyncExternalStore never re-subscribes.
const NOOP_SUBSCRIBE = () => () => {};
const NULL_SNAPSHOT = (): SyncStatus | null => null;

export interface SyncController {
  /** Live sync status, or null when there's nothing to sync (guest / demo mode). */
  status: SyncStatus | null;
  /** Force a sync now (no-op for guests). */
  syncNow: () => void;
}

/**
 * Subscribe to the signed-in SyncRepository's status. Guests use a plain DexieRepository
 * with no server half, so `status` is null and the UI shows nothing.
 */
export function useSyncStatus(): SyncController {
  const { repo } = useRepository();
  const sync = repo instanceof SyncRepository ? repo : null;
  // `subscribeSyncStatus`/`getSyncStatus` are stable instance-bound arrows, so passing them
  // directly (vs. a fresh closure) avoids re-subscribing on every render.
  const status = useSyncExternalStore(
    sync ? sync.subscribeSyncStatus : NOOP_SUBSCRIBE,
    sync ? sync.getSyncStatus : NULL_SNAPSHOT,
  );
  const syncNow = useCallback(() => {
    void sync?.sync();
  }, [sync]);
  return { status, syncNow };
}
