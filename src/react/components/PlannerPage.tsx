import { useEffect, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate, useParams } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { SHIFT_TYPE_LABEL, type Shift, type ShiftDraft } from "../../domain/types";
import {
  clampResizeSpan,
  hhmm,
  isAllDay,
  isoDate,
  shiftEnd,
  shiftStart,
} from "../../logic/calendar";
import { computeNetHours } from "../../logic/hours";
import { buildIcs } from "../../logic/ics";
import { droppedShiftDraft } from "../../logic/shiftDraft";
import { usePlacements, useShifts, useBreakRules } from "../hooks";
import { useShiftActions } from "../ShiftsContext";
import { useRepository } from "../RepositoryContext";
import { downloadText } from "../download";
import { ActivityLog } from "./ActivityLog";
import { PlacementPalette } from "./PlacementPalette";
import { ShiftDebrief } from "./ShiftDebrief";
import { ShiftModal } from "./ShiftModal";
import { PageHero, Panel, btnGhostSm, btnPrimary } from "./ui";

type NewShift = { date: string; startTime?: string; endTime?: string };

const eventClass = (s: Shift) =>
  s.isSimulated ? "ev-sim" : s.status === "COMPLETED" ? "ev-counted" : "ev-planned";

export function PlannerPage() {
  const { user, loading } = useRepository();
  const { placements } = usePlacements();
  const { shifts, summary } = useShifts();
  const { saveShift, deleteShift, markWorked, reactivateShift, editShift, copyShift, addShift } =
    useShiftActions();
  const { rules } = useBreakRules();
  // The shift editor is a URL-driven modal: `/planner/:shiftId` edits (read live
  // from the list so its lock state stays current), `/planner/new` creates. A new
  // shift's calendar-slot prefill rides in on the route's router state.
  const { shiftId } = useParams();
  const isNewRoute = !!useMatch("/planner/new");
  const location = useLocation();
  const navigate = useNavigate();
  const editingShift = shiftId ? (shifts.find((s) => s.id === shiftId) ?? null) : null;
  const locked = editingShift?.status === "COMPLETED";
  const prefill = isNewRoute
    ? ((location.state as NewShift | null) ?? { date: isoDate(new Date()) })
    : null;
  const modalOpen = isNewRoute || !!editingShift;
  // Bumped after an in-place save so the modal can flash a "Saved" confirmation.
  const [savedTick, setSavedTick] = useState(0);
  // The just-completed shift whose post-shift debrief (U1) is showing.
  const [debriefShiftId, setDebriefShiftId] = useState<string | null>(null);

  // Backspace/Delete on a selected event deletes it (single stable listener that
  // reads the latest state via this ref, set on each render below).
  const deleteKeyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => deleteKeyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When a shift opens (deep-link or click), jump the calendar to its week.
  const calRef = useRef<FullCalendar>(null);
  const openShiftDate = editingShift?.date;
  useEffect(() => {
    if (openShiftDate) calRef.current?.getApi().gotoDate(openShiftDate);
  }, [openShiftDate]);

  const openNew = (ns: NewShift) => navigate("/planner/new", { state: ns });
  const openEdit = (shift: Shift) => navigate(`/planner/${shift.id}`);
  const close = () => navigate("/planner");

  if (loading || !user) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  const placementName = new Map(placements.map((p) => [p.id, p.name]));
  // Default a new shift to the placement of the most recent shift (listShifts is
  // newest-date first) — usually you're still at the same ward.
  const lastPlacementId = shifts.find((s) => s.placementId)?.placementId;
  const debriefShift = debriefShiftId
    ? (shifts.find((s) => s.id === debriefShiftId) ?? null)
    : null;

  const events: EventInput[] = shifts.map((s) => ({
    id: s.id,
    start: shiftStart(s),
    end: shiftEnd(s),
    allDay: isAllDay(s),
    // Highlight the event currently open in the editor as the active selection.
    classNames: [eventClass(s), editingShift?.id === s.id ? "ev-active" : ""].filter(Boolean),
    // A completed shift is locked: no drag or resize on the grid.
    editable: s.status !== "COMPLETED",
    extendedProps: { shift: s },
  }));

  // Save from the modal. A brand-new shift transitions into edit mode on itself
  // (stay in the modal → its capture tabs light up); an edit saves in place and
  // flashes a "Saved" confirmation without leaving the shift.
  const submitShift = async (draft: ShiftDraft) => {
    const saved = await saveShift(draft, editingShift?.id ?? null);
    if (!saved) return;
    if (editingShift) setSavedTick((n) => n + 1);
    else navigate(`/planner/${saved.id}`, { replace: true });
  };

  const removeShift = async (shift: Shift) => {
    if (await deleteShift(shift)) close();
  };

  const completeShift = async (id: string) => {
    if (await markWorked(id)) {
      close();
      setDebriefShiftId(id); // open the post-shift debrief (U1)
    }
  };

  // Delete the selected (unlocked) shift on Backspace/Delete — unless the user is
  // typing in a form field. Locked (completed) shifts have no Delete, so skip them.
  deleteKeyHandler.current = (e: KeyboardEvent) => {
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    if (!editingShift || locked) return;
    const t = e.target as HTMLElement | null;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    e.preventDefault();
    void removeShift(editingShift);
  };

  // Store a dragged moment as a full UTC ISO instant.
  const at = (d: Date) => d.toISOString();

  // Drag-to-reschedule: duration is preserved by FullCalendar, so the stored
  // netHours stays valid — we only move the start date and the start/end datetimes.
  const applyMove = async (shift: Shift, start: Date, allDay: boolean, end: Date | null) => {
    const patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">> = { date: isoDate(start) };
    if (allDay) {
      patch.startAt = undefined;
      patch.endAt = undefined;
    } else {
      patch.startAt = at(start);
      patch.endAt = end ? at(end) : undefined;
    }
    await editShift(shift, patch);
  };

  // Drag the edge to change duration: recompute the counted hours + break for the
  // new span (treated as RAW, so the band rules apply). The span is clamped to 24h
  // from the start hour — a nurse shift is never longer, and it stops a stray drag
  // (e.g. out to 25h) producing a nonsensical shift.
  const applyResize = async (shift: Shift, start: Date, end: Date) => {
    const origStartMs = shift.startAt ? new Date(shift.startAt).getTime() : start.getTime();
    const { startMs, endMs } = clampResizeSpan(origStartMs, start.getTime(), end.getTime());
    const s = new Date(startMs);
    const e = new Date(endMs);
    const rawDurationMins = Math.round((endMs - startMs) / 60000);
    const { netHours, breakMins } = computeNetHours({ entryMode: "RAW", rawDurationMins }, rules);
    await editShift(shift, {
      entryMode: "RAW",
      date: isoDate(s),
      startAt: at(s),
      endAt: at(e),
      rawDurationMins,
      breakMins,
      netHours,
    });
  };

  const renderChip = (shift: Shift, timeText: string) => {
    const name = shift.placementId ? placementName.get(shift.placementId) : undefined;
    return (
      <div className="flex items-start gap-1 overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
        <div className="min-w-0 flex-1">
          {timeText && <div className="truncate font-semibold tabular-nums">{timeText}</div>}
          <div className="truncate font-medium">
            {name ?? <span className="opacity-60">No placement</span>}
          </div>
          <div className="truncate text-[10px] opacity-60">{SHIFT_TYPE_LABEL[shift.shiftType]}</div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {shift.status === "PLANNED" && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void copyShift(shift);
              }}
              aria-label="Make a copy"
              title="Make a copy (then drag it)"
              className="rounded p-0.5 hover:bg-black/5"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          )}
          {shift.status === "PLANNED" ? (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void completeShift(shift.id);
              }}
              aria-label="Mark worked"
              title="Mark worked"
              className="rounded p-0.5 hover:bg-black/5"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <path d="m5 13 4 4L19 7" />
              </svg>
            </button>
          ) : (
            <span
              aria-label="Locked"
              title="Counted toward your hours — unlock to edit"
              className="p-0.5 opacity-70"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Planning"
        title="Weekly shift planner"
        subtitle="Plan shifts on the calendar, then tick them off — they're the same shifts as your hours log."
        aside={
          <>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {summary.practiceHours}
              <span className="text-base font-normal text-slate-400">
                {" "}
                / {summary.targetHours.toLocaleString()} h
              </span>
            </div>
            <div className="text-xs font-medium text-emerald-600">counted</div>
          </>
        }
      />

      {debriefShift && (
        <ShiftDebrief shift={debriefShift} onDismiss={() => setDebriefShiftId(null)} />
      )}

      <PlacementPalette placements={placements} />

      <Panel
        title="Your shifts"
        hint="Click a day or drag across hours to add · drag a shift to move · click to edit"
        className="min-w-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                downloadText(
                  "shift-planner.ics",
                  buildIcs(shifts, placements),
                  "text/calendar;charset=utf-8;",
                )
              }
              className={btnGhostSm}
            >
              Add to calendar (.ics)
            </button>
            <button
              type="button"
              onClick={() => openNew({ date: isoDate(new Date()) })}
              className={btnPrimary}
            >
              New shift
            </button>
          </div>
        }
      >
        <div className="fc-theme-wrap">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            firstDay={1}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            height={680}
            scrollTime="07:00:00"
            nowIndicator
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            editable
            droppable
            selectable
            selectMirror
            selectMinDistance={5}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            dayMaxEvents
            events={events}
            eventContent={(arg) => {
              const shift = arg.event.extendedProps.shift as Shift | undefined;
              return shift ? renderChip(shift, arg.timeText) : undefined;
            }}
            dateClick={(arg) => openNew({ date: arg.dateStr.slice(0, 10) })}
            select={(arg) =>
              openNew(
                arg.allDay
                  ? { date: isoDate(arg.start) }
                  : {
                      date: isoDate(arg.start),
                      startTime: hhmm(arg.start),
                      endTime: hhmm(arg.end),
                    },
              )
            }
            eventClick={(arg) => {
              const shift = arg.event.extendedProps.shift as Shift | undefined;
              if (shift) openEdit(shift);
            }}
            eventDrop={(arg) => {
              const ev = arg.event;
              const shift = ev.extendedProps.shift as Shift | undefined;
              if (shift && ev.start) void applyMove(shift, ev.start, ev.allDay, ev.end);
            }}
            eventResize={(arg) => {
              const ev = arg.event;
              const shift = ev.extendedProps.shift as Shift | undefined;
              if (shift && !ev.allDay && ev.start && ev.end)
                void applyResize(shift, ev.start, ev.end);
              else arg.revert();
            }}
            eventReceive={(info) => {
              // A placement chip was dropped → create a 2h planned shift, then
              // remove FullCalendar's temporary event (we render from our store).
              const placementId = info.event.extendedProps.placementId as string | undefined;
              const start = info.event.start;
              info.event.remove();
              if (start) void addShift(droppedShiftDraft(start, 120, placementId, rules));
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-slate-300" />
            Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" />
            Counted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-sky-400" />
            Simulated
          </span>
        </div>
      </Panel>

      <ActivityLog />

      {modalOpen && (
        <ShiftModal
          key={
            editingShift
              ? `edit-${editingShift.id}-${editingShift.status}`
              : `new-${prefill?.date}-${prefill?.startTime ?? ""}-${prefill?.endTime ?? ""}`
          }
          mode={editingShift ? "edit" : "new"}
          shift={editingShift}
          locked={locked}
          placements={placements}
          prefill={prefill}
          lastPlacementId={lastPlacementId}
          saved={savedTick}
          onSubmit={submitShift}
          onCancel={close}
          onClose={close}
          onDelete={() => editingShift && void removeShift(editingShift)}
          onCopy={() => editingShift && void copyShift(editingShift)}
          onMarkWorked={() => editingShift && void completeShift(editingShift.id)}
          onUnlock={() => editingShift && void reactivateShift(editingShift)}
        />
      )}
    </div>
  );
}
