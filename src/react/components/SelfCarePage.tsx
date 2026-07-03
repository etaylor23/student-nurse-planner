import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Shift } from "../../domain/types";
import { formatHumanDate, isoDate } from "../../logic/calendar";
import {
  LOW_ENERGY_THRESHOLD,
  SELF_CARE_DIMENSIONS,
  SELF_CARE_ITEMS,
  SUPPORT_LINKS,
  joinItems,
  parseItems,
} from "../../logic/selfCare";
import { useSelfCare, useShifts } from "../hooks";
import { useSelfCareActions } from "../useSelfCareActions";
import { PageHero, Panel, btnPrimary } from "./ui";

const todayIso = () => isoDate(new Date());

function shiftLabel(s: Shift): string {
  return `${formatHumanDate(s.date)}`;
}

const ITEM_LABEL = new Map(SELF_CARE_ITEMS.map((i) => [i.key, i.label]));

export function SelfCarePage() {
  const { checkins, reload } = useSelfCare();
  const { addCheckin, deleteCheckin } = useSelfCareActions();
  const { shifts } = useShifts();
  const prefillShiftId = (useLocation().state as { prefillShiftId?: string } | null)
    ?.prefillShiftId;

  const [energy, setEnergy] = useState<number | undefined>();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const linkedShift = prefillShiftId ? shiftById.get(prefillShiftId) : undefined;
  const lowEnergy = energy != null && energy <= LOW_ENERGY_THRESHOLD;

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    const created = await addCheckin({
      date: todayIso(),
      shiftId: prefillShiftId || undefined,
      energy,
      note: note.trim() || undefined,
      items: joinItems([...checked]),
    });
    if (!created) return; // nothing persisted (e.g. before the user has loaded) — don't clear
    setEnergy(undefined);
    setChecked(new Set());
    setNote("");
    await reload();
    setSaved(true); // transient golden moment
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Study & wellbeing"
        title="Self-care check-in"
        subtitle="A gentle, private space to check in with yourself. No scores, no streaks — just a moment to notice how you're doing."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel
            title="How are you doing?"
            hint={
              linkedShift
                ? `After your shift on ${shiftLabel(linkedShift)} — take a moment`
                : "Everything here stays private, on this device"
            }
          >
            {/* Energy */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                Your energy today <span className="font-normal text-slate-400">(optional)</span>
              </p>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEnergy((cur) => (cur === n ? undefined : n))}
                    aria-pressed={energy === n}
                    className={
                      "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ring-1 transition " +
                      (energy === n
                        ? "bg-emerald-600 text-white ring-emerald-600"
                        : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50")
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">1 = running on empty · 5 = doing well</p>
            </div>

            {lowEnergy && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100">
                It sounds like a tough day — you don't have to manage on your own. There's
                confidential support below whenever you want it.
              </div>
            )}

            {/* Dimensions checklist */}
            <div className="mt-5 space-y-4">
              {SELF_CARE_DIMENSIONS.map((dim) => (
                <div key={dim.key}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {dim.label}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SELF_CARE_ITEMS.filter((i) => i.dimension === dim.key).map((item) => (
                      <label
                        key={item.key}
                        className={
                          "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition cursor-pointer " +
                          (checked.has(item.key)
                            ? "border-emerald-300 bg-emerald-50/60 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(item.key)}
                          onChange={() => toggle(item.key)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Private note */}
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                A private note <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                placeholder="Anything you want to note for yourself — stays on this device."
              />
            </label>

            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={() => void save()} className={btnPrimary}>
                Log check-in
              </button>
              {saved && (
                <span className="text-sm font-medium text-emerald-700">
                  Logged — be kind to yourself 💚
                </span>
              )}
            </div>
          </Panel>

          <Panel title="Recent check-ins" hint="Private to you, on this device">
            {checkins.length === 0 ? (
              <p className="text-sm text-slate-400">
                No check-ins yet — there's no wrong way to use this. Check in whenever it helps.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {checkins.map((c) => {
                  const items = parseItems(c.items);
                  return (
                    <li key={c.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {formatHumanDate(c.date)}
                          {c.energy != null && (
                            <span className="font-normal text-slate-400">
                              {" "}
                              · energy {c.energy}/5
                            </span>
                          )}
                        </p>
                        {items.length > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {items.map((k) => ITEM_LABEL.get(k) ?? k).join(" · ")}
                          </p>
                        )}
                        {c.note && <p className="mt-0.5 text-sm text-slate-500">{c.note}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCheckin(c.id);
                          await reload();
                        }}
                        aria-label="Delete check-in"
                        className="shrink-0 text-xs font-medium text-rose-600"
                      >
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-1">
          <Panel title="Support, any time" hint="You're not alone — reach out whenever">
            <ul className="space-y-3">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.label} className="text-sm">
                  {link.href ? (
                    <a
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <span className="font-medium text-slate-700">{link.label}</span>
                  )}
                  <p className="text-xs text-slate-500">{link.detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              If you're ever in crisis or thinking about harming yourself, please contact 999 or go
              to your nearest A&E.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
