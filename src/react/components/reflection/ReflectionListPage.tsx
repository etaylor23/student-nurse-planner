import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GIBBS_STAGES, type Reflection, type ReflectionSection } from "../../../domain/types";
import { gibbsCompleteness, reflectionMatchesQuery } from "../../../logic/gibbs";
import { formatHumanDate } from "../../../logic/calendar";
import { useReflections } from "../../hooks";
import { useReflectionLock } from "../../reflectionLock";
import { btnGhostSm, btnPrimary, inputCls } from "../ui";
import { CompletenessMeter, LockBadge, TagPills } from "./shared";

const STAGE_ORDER = new Map(GIBBS_STAGES.map((s, i) => [s, i]));

/** The earliest-stage non-empty content (stored rows aren't stage-ordered), as a preview. */
function snippet(sections: ReflectionSection[]): string {
  const filled = sections
    .filter((s) => s.content.trim() !== "")
    .sort((a, b) => (STAGE_ORDER.get(a.stage) ?? 0) - (STAGE_ORDER.get(b.stage) ?? 0));
  if (filled.length === 0) return "";
  const text = filled[0].content.trim().replace(/\s+/g, " ");
  return text.length > 140 ? text.slice(0, 139).trimEnd() + "…" : text;
}

export function ReflectionListPage() {
  const { reflections, sections, tags, reflectionTags } = useReflections();
  const { unlocked } = useReflectionLock();
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Per-reflection lookups.
  const sectionsByReflection = useMemo(() => {
    const map = new Map<string, ReflectionSection[]>();
    for (const s of sections) {
      const arr = map.get(s.reflectionId) ?? [];
      arr.push(s);
      map.set(s.reflectionId, arr);
    }
    return map;
  }, [sections]);
  const tagLabelById = useMemo(() => new Map(tags.map((t) => [t.id, t.label])), [tags]);
  const tagLabelsByReflection = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const rt of reflectionTags) {
      const label = tagLabelById.get(rt.tagId);
      if (!label) continue;
      const arr = map.get(rt.reflectionId) ?? [];
      arr.push(label);
      map.set(rt.reflectionId, arr);
    }
    return map;
  }, [reflectionTags, tagLabelById]);

  const visible = useMemo(() => {
    return reflections.filter((r) => {
      const secs = sectionsByReflection.get(r.id) ?? [];
      const labels = tagLabelsByReflection.get(r.id) ?? [];
      if (tagFilter && !labels.includes(tagFilter)) return false;
      // Don't let a locked (and not-unlocked) reflection's hidden body be searchable —
      // that would leak private content the row itself hides. Title + tags only.
      const gated = r.isLocked && !unlocked;
      return reflectionMatchesQuery(
        {
          title: r.title,
          sectionContents: gated ? [] : secs.map((s) => s.content),
          tagLabels: labels,
        },
        q,
      );
    });
  }, [reflections, sectionsByReflection, tagLabelsByReflection, tagFilter, q, unlocked]);

  return (
    <div className="space-y-4">
      <LockSettings />

      {reflections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-600">No reflections yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Reflect on something that happened on placement using the Gibbs cycle — you can also
            start one straight from a shift's debrief.
          </p>
          <Link to="/reflection/new" className={btnPrimary + " mt-4"}>
            Write your first reflection
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles, content and tags…"
              className={inputCls + " sm:max-w-sm"}
            />
            <Link to="/reflection/new" className={btnPrimary + " shrink-0"}>
              + New reflection
            </Link>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={tagFilter === null} onClick={() => setTagFilter(null)}>
                All
              </FilterChip>
              {tags.map((t) => (
                <FilterChip
                  key={t.id}
                  active={tagFilter === t.label}
                  onClick={() => setTagFilter((cur) => (cur === t.label ? null : t.label))}
                >
                  #{t.label}
                </FilterChip>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
              No reflections match.
            </p>
          ) : (
            <ul className="space-y-3">
              {visible.map((r) => (
                <ReflectionRow
                  key={r.id}
                  reflection={r}
                  sections={sectionsByReflection.get(r.id) ?? []}
                  tagLabels={tagLabelsByReflection.get(r.id) ?? []}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ReflectionRow({
  reflection,
  sections,
  tagLabels,
}: {
  reflection: Reflection;
  sections: ReflectionSection[];
  tagLabels: string[];
}) {
  const completeness = gibbsCompleteness(sections);
  const dateLabel = reflection.occurredOn ? formatHumanDate(reflection.occurredOn) : null;
  return (
    <li>
      <Link
        to={`/reflection/${reflection.id}`}
        className="block rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 transition hover:ring-emerald-300"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{reflection.title}</p>
            {dateLabel && <p className="mt-0.5 text-xs text-slate-400">{dateLabel}</p>}
          </div>
          {reflection.isLocked && <LockBadge />}
        </div>
        {reflection.isLocked ? (
          <p className="mt-2 text-sm text-slate-400">Locked — open to unlock and read.</p>
        ) : (
          snippet(sections) && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-500">{snippet(sections)}</p>
          )
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <CompletenessMeter completeness={completeness} />
          <TagPills labels={tagLabels} />
        </div>
      </Link>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-2.5 py-1 text-xs font-medium transition ring-1 " +
        (active
          ? "bg-emerald-600 text-white ring-emerald-600"
          : "bg-white text-slate-500 ring-slate-200 hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}

/**
 * The device lock control: set / change / clear a PIN and lock now. Kept compact and
 * honest — this is a local convenience gate, not real security.
 */
function LockSettings() {
  const { pinSet, unlocked, setPin, clearPin, relock } = useReflectionLock();
  const [editing, setEditing] = useState(false);
  const [pin, setPinInput] = useState("");

  if (!pinSet && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 ring-1 ring-slate-200/60">
        <span>Set a device PIN to lock private reflections on a shared laptop.</span>
        <button type="button" onClick={() => setEditing(true)} className={btnGhostSm}>
          Set a PIN
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.trim().length >= 4) {
            setPin(pin.trim());
            setPinInput("");
            setEditing(false);
          }
        }}
        className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200/60"
      >
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPinInput(e.target.value)}
          placeholder="4+ digit PIN"
          className={inputCls + " max-w-[10rem] py-2"}
          autoFocus
        />
        <button type="submit" className={btnGhostSm}>
          Save PIN
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setPinInput("");
          }}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500 ring-1 ring-slate-200/60">
      <span>Device PIN is on{unlocked ? " · unlocked this session" : " · locked"}.</span>
      <div className="flex gap-2">
        {unlocked && (
          <button type="button" onClick={relock} className={btnGhostSm}>
            Lock now
          </button>
        )}
        <button type="button" onClick={() => setEditing(true)} className={btnGhostSm}>
          Change PIN
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm("Remove the device PIN? Locked reflections will no longer be gated.")
            )
              clearPin();
          }}
          className="text-xs font-medium text-rose-600"
        >
          Remove PIN
        </button>
      </div>
    </div>
  );
}
