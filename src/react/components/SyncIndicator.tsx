import { useState } from "react";
import { Link } from "react-router-dom";
import type { SyncStatus } from "../../data/sync/syncRepository";
import { useSyncStatus } from "../useSyncStatus";
import { Panel, btnGhostSm } from "./ui";

const HOUR_MS = 60 * 60 * 1000;

/** Relative "last synced" phrasing for the compact indicator + panel. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "not yet";
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "not yet";
  if (diff < 45_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type Tone = "ok" | "busy" | "warn" | "bad";

function describe(status: SyncStatus): { tone: Tone; label: string } {
  if (status.phase === "syncing") return { tone: "busy", label: "Syncing…" };
  if (status.phase === "error") return { tone: "bad", label: "Not syncing" };
  if (status.pendingCount > 0) {
    const n = status.pendingCount;
    if (status.phase === "offline") return { tone: "warn", label: "Offline" };
    return { tone: "warn", label: `${n} to sync` };
  }
  if (status.phase === "offline") return { tone: "warn", label: "Offline" };
  return { tone: "ok", label: "Synced" };
}

const DOT: Record<Tone, string> = {
  ok: "bg-primary-500",
  busy: "bg-secondary-500 animate-pulse",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

/**
 * Compact header indicator. Quiet green when synced; amber when changes are waiting or
 * offline; red when sync is failing. Links to the Profile sync panel for detail. Renders
 * nothing for guests (no server to sync to).
 */
export function SyncIndicator() {
  const { status } = useSyncStatus();
  if (!status) return null;
  const { tone, label } = describe(status);
  return (
    <Link
      to="/profile"
      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
      title={`Last synced ${relativeTime(status.lastSyncAt)}`}
      aria-label={`Sync status: ${label}. Last synced ${relativeTime(status.lastSyncAt)}.`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[tone]}`} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

/**
 * Prominent, dismissible banner shown only when changes are genuinely stuck: sync is
 * failing, or edits have been waiting unsynced for over an hour. Never implies data loss —
 * local data is safe; it's the cloud copy that's behind.
 */
export function SyncBanner() {
  const { status, syncNow } = useSyncStatus();
  const [dismissed, setDismissed] = useState(false);
  if (!status || dismissed) return null;

  const stale =
    status.pendingCount > 0 &&
    (status.phase === "error" ||
      !status.lastSyncAt ||
      Date.now() - Date.parse(status.lastSyncAt) > HOUR_MS);
  if (!stale) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Your latest changes are saved on this device but haven&rsquo;t reached the cloud yet.
        </span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={syncNow}
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Sync now
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-amber-700/80 hover:text-amber-900"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * The Profile "Sync" panel: current state, last-synced time, pending count, any error, and
 * a manual "Sync now". Renders nothing for guests. Copy reassures that local data is safe —
 * a stuck sync means the cloud copy is behind, never that anything is lost.
 */
export function SyncPanel() {
  const { status, syncNow } = useSyncStatus();
  if (!status) return null;
  const { tone, label } = describe(status);
  return (
    <Panel title="Sync" hint="Backed up to your account">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <p className="mt-2 text-sm text-slate-500">Last synced {relativeTime(status.lastSyncAt)}.</p>
      {status.pendingCount > 0 && (
        <p className="mt-1 text-sm text-slate-500">
          {status.pendingCount} change{status.pendingCount === 1 ? "" : "s"} waiting to upload.
        </p>
      )}
      {status.phase === "error" && status.lastError && (
        <p className="mt-1 text-xs text-red-600">
          Couldn&rsquo;t reach the server: {status.lastError}
        </p>
      )}
      <button
        type="button"
        onClick={syncNow}
        disabled={status.phase === "syncing"}
        className={`${btnGhostSm} mt-3 ${status.phase === "syncing" ? "opacity-50" : ""}`}
      >
        {status.phase === "syncing" ? "Syncing…" : "Sync now"}
      </button>
      <p className="mt-3 text-xs text-slate-400">
        Everything you enter is saved on this device first, then synced to your account. If sync
        falls behind, your data is still safe here.
      </p>
    </Panel>
  );
}
