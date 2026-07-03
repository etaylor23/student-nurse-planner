import { useMemo, useState } from "react";
import type { Reflection, ReflectionSection, Shift, Tag } from "../../../domain/types";
import { GIBBS_STAGES } from "../../../domain/types";
import { formatHumanDate, hhmm, isoDate } from "../../../logic/calendar";
import { GIBBS_PROMPT_LIST } from "../../../logic/gibbs";
import { findCurrentShift, recentShifts } from "../../../logic/shiftContext";
import { usePlacements, useReflections, useShifts } from "../../hooks";
import { useReflectionActions } from "../../useReflectionActions";
import { btnGhostSm, btnPrimary, inputCls } from "../ui";

const todayIso = () => isoDate(new Date());

function shiftLabel(s: Shift, placeName: Map<string, string>): string {
  const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
  const times =
    s.startAt && s.endAt ? ` ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
  return `${formatHumanDate(s.date)} · ${place}${times}`;
}

/**
 * The Gibbs reflection editor — used for both a new reflection and inline editing of
 * an existing one. Six guided sections (never a blank canvas), a standing PII warning,
 * optional shift link (the universal `shiftId` capture join — prefilled from a shift
 * debrief/editor), tags, and a device lock toggle. Proficiency links are managed on
 * the read view once the reflection exists.
 */
export function ReflectionEditor({
  initial,
  prefillShiftId,
  prefillTitle,
  prefillTags,
  onSaved,
  onCancel,
}: {
  initial?: { reflection: Reflection; sections: ReflectionSection[]; tags: Tag[] };
  prefillShiftId?: string;
  prefillTitle?: string;
  prefillTags?: string[];
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const { create, update } = useReflectionActions();
  const { tags: allTags } = useReflections();
  const { shifts } = useShifts();
  const { placements } = usePlacements();

  const [title, setTitle] = useState(initial?.reflection.title ?? prefillTitle ?? "");
  const [occurredOn, setOccurredOn] = useState(initial?.reflection.occurredOn ?? todayIso());
  const [content, setContent] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const stage of GIBBS_STAGES) map[stage] = "";
    for (const s of initial?.sections ?? []) map[s.stage] = s.content;
    return map;
  });
  const [tagList, setTagList] = useState<string[]>(() =>
    initial ? initial.tags.map((t) => t.label) : (prefillTags ?? []),
  );
  const [tagInput, setTagInput] = useState("");
  const [isLocked, setIsLocked] = useState(initial?.reflection.isLocked ?? false);
  const [piiAck, setPiiAck] = useState(initial?.reflection.piiAcknowledged ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Shift pin — same pattern as the med-log / skill sign-off pickers. `null` =
  // auto-follow the current timed shift; once chosen, the choice wins ("" = none).
  const initialShift = initial ? (initial.reflection.shiftId ?? "") : (prefillShiftId ?? null);
  const [pickedShift, setPickedShift] = useState<string | null>(initialShift);
  const placeName = useMemo(() => new Map(placements.map((p) => [p.id, p.name])), [placements]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const currentShift = useMemo(() => findCurrentShift(shifts, Date.now()), [shifts]);
  const recent = useMemo(() => recentShifts(shifts, todayIso()), [shifts]);
  const shiftId = pickedShift === null ? (currentShift?.id ?? "") : pickedShift;
  const selectedShift = shiftId ? shiftById.get(shiftId) : undefined;
  const shiftOptions = useMemo(() => {
    if (selectedShift && !recent.some((s) => s.id === selectedShift.id)) {
      return [selectedShift, ...recent];
    }
    return recent;
  }, [recent, selectedShift]);

  // Existing tags not already added — one-tap suggestions.
  const tagSuggestions = allTags
    .map((t) => t.label)
    .filter((l) => !tagList.some((x) => x.toLowerCase() === l.toLowerCase()));

  const addTag = (raw: string) => {
    const label = raw.trim();
    if (label === "") return;
    if (tagList.some((x) => x.toLowerCase() === label.toLowerCase())) return;
    setTagList((list) => [...list, label]);
    setTagInput("");
  };
  const removeTag = (label: string) => setTagList((list) => list.filter((x) => x !== label));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (title.trim() === "") {
      setError("Give the reflection a short title.");
      return;
    }
    if (!piiAck) {
      setError("Confirm you've kept the reflection free of patient-identifiable information.");
      return;
    }
    setSaving(true);
    const sections = GIBBS_STAGES.map((stage) => ({ stage, content: content[stage] ?? "" }));
    const draft = {
      title: title.trim(),
      model: "GIBBS" as const,
      occurredOn: occurredOn || undefined,
      shiftId: shiftId || undefined,
      isLocked,
      piiAcknowledged: true,
    };
    // Pending tag entry not yet committed to a chip — include it so nothing's lost.
    const tags = tagInput.trim() ? [...tagList, tagInput.trim()] : tagList;
    try {
      const saved = initial
        ? await update(initial.reflection.id, draft, sections, tags)
        : await create(draft, sections, tags);
      if (saved) onSaved(saved.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Standing PII warning — always visible while writing. */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <span>
          Keep this anonymous — <strong>never</strong> record anything that could identify a
          patient, family member or colleague (names, dates of birth, NHS numbers). Your PAD remains
          the official signed record.
        </span>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          placeholder="e.g. Escalating a deteriorating patient"
          autoFocus
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            When did it happen?
          </span>
          <input
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Shift (optional)</span>
          <select
            value={shiftId}
            onChange={(e) => setPickedShift(e.target.value)}
            className={inputCls}
          >
            <option value="">No shift</option>
            {shiftOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s, placeName)}
                {s.id === currentShift?.id ? " — now" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            {currentShift
              ? "You're in a shift now — linked automatically."
              : "Link the shift this reflects on, so it shows on that placement."}
          </span>
        </label>
      </div>

      {/* The six Gibbs stages with guided prompts. */}
      <div className="space-y-4">
        {GIBBS_PROMPT_LIST.map((p, i) => (
          <label key={p.stage} className="block">
            <span className="mb-1 flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-slate-700">{p.prompt}</span>
            </span>
            <span className="mb-1.5 ml-7 block text-xs text-slate-400">{p.helper}</span>
            <textarea
              value={content[p.stage] ?? ""}
              onChange={(e) => setContent((c) => ({ ...c, [p.stage]: e.target.value }))}
              rows={3}
              className={inputCls}
            />
          </label>
        ))}
      </div>

      {/* Tags */}
      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Tags</span>
        {tagList.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tagList.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100"
              >
                #{label}
                <button
                  type="button"
                  onClick={() => removeTag(label)}
                  aria-label={`Remove tag ${label}`}
                  className="text-emerald-500 hover:text-emerald-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          className={inputCls}
          placeholder="Type a tag and press Enter (e.g. medication, escalation)"
        />
        {tagSuggestions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tagSuggestions.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => addTag(label)}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              >
                + {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lock + PII acknowledgement */}
      <div className="space-y-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200/60">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isLocked}
            onChange={(e) => setIsLocked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
          />
          <span>
            Lock this reflection
            <span className="block text-xs text-slate-400">
              Hides it behind your device PIN (set one from the reflection list). A local
              convenience gate — not encryption.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={piiAck}
            onChange={(e) => setPiiAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
          />
          <span>I've kept this free of patient-identifiable information.</span>
        </label>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={btnPrimary}>
          {initial ? "Save reflection" : "Save reflection"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={btnGhostSm + " px-4 py-2.5"}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
