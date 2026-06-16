import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { SHIFT_TYPE_LABEL, type Shift } from "../../domain/types";
import {
  clampResizeSpan,
  composeShiftTimes,
  hhmm,
  isAllDay,
  isoDate,
  shiftEnd,
  shiftStart,
} from "../../logic/calendar";
import { computeNetHours } from "../../logic/hours";
import { buildIcs } from "../../logic/ics";
import { usePlacements, useShifts, useBreakRules } from "../hooks";
import { useShiftActions } from "../ShiftsContext";
import { useRepository } from "../RepositoryContext";
import { downloadText } from "../download";
import { ShiftForm, type ShiftDraft } from "./ShiftForm";
import { ShiftHistory } from "./ShiftHistory";
import { PageHero, Panel, btnGhostSm, btnPrimary } from "./ui";

type NewShift = { date: string; startTime?: string; endTime?: string };
type Editing = Shift | NewShift | null;
const isShift = (e: Exclude<Editing, null>): e is Shift => "id" in e;

const eventClass = (s: Shift) =>
  s.isSimulated ? "ev-sim" : s.status === "COMPLETED" ? "ev-counted" : "ev-planned";

export function PlannerPage() {
  const { repo, user, loading } = useRepository();
  const { placements } = usePlacements();
  const { shifts, summary, reload: reloadShifts } = useShifts();
  const { saveShift, deleteShift, markWorked, reactivateShift } = useShiftActions();
  const { rules } = useBreakRules();
  const [searchParams] = useSearchParams();
  // Deep-link target, e.g. /planner?date=2026-06-18 (from a timesheet row).
  const initialDate = searchParams.get("date") ?? undefined;
  const [editing, setEditing] = useState<Editing>(null);
  // Live draft for the calendar highlight; kept in step with the form's fields.
  const [draft, setDraft] = useState<NewShift | null>(null);

  const openNew = (ns: NewShift) => {
    setEditing(ns);
    setDraft(ns);
  };
  const openEdit = (shift: Shift) => {
    setEditing(shift);
    setDraft(null);
  };
  const close = () => {
    setEditing(null);
    setDraft(null);
  };

  if (loading || !user) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  const placementName = new Map(placements.map((p) => [p.id, p.name]));
  // Default a new shift to the placement of the most recent shift (listShifts is
  // newest-date first) — usually you're still at the same ward.
  const lastPlacementId = shifts.find((s) => s.placementId)?.placementId;

  // The target being edited: a live shift (re-read from the list so its lock
  // state stays current after a mutation) or a new-shift draft.
  const editingShift =
    editing && isShift(editing) ? (shifts.find((s) => s.id === editing.id) ?? editing) : null;
  const newShift = editing && !isShift(editing) ? editing : null;
  const locked = editingShift?.status === "COMPLETED";

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

  // A persistent, live "draft" highlight while a NEW shift is being configured —
  // driven by `draft`, which the form updates as its date/times change. Compose
  // absolute datetimes so an overnight draft renders across midnight.
  const draftShift = draft
    ? { date: draft.date, ...composeShiftTimes(draft.date, draft.startTime, draft.endTime) }
    : null;
  const draftEvent: EventInput | null = draftShift
    ? {
        id: "__draft__",
        start: shiftStart(draftShift),
        end: shiftEnd(draftShift),
        allDay: isAllDay(draftShift),
        display: "background",
        classNames: ["ev-draft"],
      }
    : null;
  const calendarEvents = draftEvent ? [...events, draftEvent] : events;

  const submitShift = async (draft: ShiftDraft) => {
    const editingId = editing && isShift(editing) ? editing.id : null;
    if (await saveShift(draft, editingId)) close();
  };

  const removeShift = async (shift: Shift) => {
    if (await deleteShift(shift)) close();
  };

  const completeShift = async (id: string) => {
    if (await markWorked(id)) close();
  };

  const at = (d: Date) => `${isoDate(d)}T${hhmm(d)}`;

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
    await repo.updateShift(shift.id, patch);
    await reloadShifts();
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
    await repo.updateShift(shift.id, {
      entryMode: "RAW",
      date: isoDate(s),
      startAt: at(s),
      endAt: at(e),
      rawDurationMins,
      breakMins,
      netHours,
    });
    await reloadShifts();
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
            className="shrink-0 rounded p-0.5 hover:bg-black/5"
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
            className="shrink-0 p-0.5 opacity-70"
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
    );
  };

  const sidebar = editing ? (
    <Panel
      title={locked ? "Locked shift" : editingShift ? "Edit shift" : "New shift"}
      hint={editingShift ? undefined : "Fill in the details and save"}
      action={
        editingShift && !locked ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void completeShift(editingShift.id)}
              className="text-xs font-medium text-emerald-600"
            >
              Mark worked
            </button>
            <button
              type="button"
              onClick={() => void removeShift(editingShift)}
              className="text-xs font-medium text-rose-600"
            >
              Delete
            </button>
          </div>
        ) : undefined
      }
    >
      <ShiftForm
        key={
          editingShift
            ? `edit-${editingShift.id}-${editingShift.status}`
            : `new-${newShift?.date}-${newShift?.startTime ?? ""}-${newShift?.endTime ?? ""}`
        }
        placements={placements}
        initial={editingShift ?? undefined}
        initialDate={editingShift ? undefined : newShift?.date}
        initialStartTime={editingShift ? undefined : newShift?.startTime}
        initialEndTime={editingShift ? undefined : newShift?.endTime}
        initialPlacementId={editingShift ? undefined : lastPlacementId}
        locked={locked}
        onDraftChange={editingShift ? undefined : setDraft}
        onSubmit={submitShift}
        onCancel={close}
        onUnlock={editingShift ? () => void reactivateShift(editingShift) : undefined}
      />
      {editingShift && <ShiftHistory shift={editingShift} />}
    </Panel>
  ) : (
    <Panel title="Add a shift" hint="Pick a time on the calendar">
      <p className="text-sm leading-relaxed text-slate-500">
        Click a day — or drag across the hours you worked — and it opens here, ready to save. Click
        an existing shift to edit it.
      </p>
      <button
        type="button"
        onClick={() => openNew({ date: isoDate(new Date()) })}
        className={`${btnPrimary} mt-4`}
      >
        New shift
      </button>
    </Panel>
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Planning"
        title="Weekly shift planner"
        subtitle="Plan shifts on the calendar, then tick them off — they're the same shifts as your hours log."
        aside={
          <>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Panel
          title="Your shifts"
          hint="Click a day or drag across hours to add · drag a shift to move · click to edit"
          className="min-w-0"
          action={
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
          }
        >
          <div className="fc-theme-wrap">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              initialDate={initialDate}
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
              selectable
              selectMirror
              selectMinDistance={5}
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              dayMaxEvents
              events={calendarEvents}
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

        <div className="xl:sticky xl:top-6 xl:self-start">{sidebar}</div>
      </div>
    </div>
  );
}
