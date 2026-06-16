import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { SHIFT_TYPE_LABEL, type Shift } from "../../domain/types";
import { hhmm, isAllDay, isoDate, shiftEnd, shiftStart } from "../../logic/calendar";
import { buildIcs } from "../../logic/ics";
import { usePlacements, useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { downloadText } from "../download";
import { ShiftForm, type ShiftDraft } from "./ShiftForm";
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
  const [editing, setEditing] = useState<Editing>(null);

  if (loading || !user) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  const placementName = new Map(placements.map((p) => [p.id, p.name]));

  const events: EventInput[] = shifts.map((s) => ({
    id: s.id,
    start: shiftStart(s),
    end: shiftEnd(s),
    allDay: isAllDay(s),
    classNames: [eventClass(s)],
    extendedProps: { shift: s },
  }));

  const submitShift = async (draft: ShiftDraft) => {
    const editingId = editing && isShift(editing) ? editing.id : null;
    const duplicate = shifts.some(
      (s) =>
        s.id !== editingId &&
        s.date === draft.date &&
        (s.placementId ?? "") === (draft.placementId ?? ""),
    );
    if (
      duplicate &&
      !window.confirm("You already logged a shift on this date at this placement. Add it anyway?")
    ) {
      return;
    }
    if (editingId) await repo.updateShift(editingId, draft);
    else await repo.createShift({ ...draft, userId: user.id });
    setEditing(null);
    await reloadShifts();
  };

  const removeShift = async (shift: Shift) => {
    if (!window.confirm(`Delete the ${shift.date} shift? This can't be undone.`)) return;
    setEditing(null);
    await repo.deleteShift(shift.id);
    await reloadShifts();
  };

  const markWorked = async (id: string) => {
    const name = window.prompt("Name the registered nurse you worked with:")?.trim();
    if (!name) return;
    await repo.updateShift(id, { status: "COMPLETED", supervisingRnName: name });
    setEditing(null);
    await reloadShifts();
  };

  // Drag-to-reschedule: duration is preserved by FullCalendar, so the stored
  // netHours stays valid — we only move the date (and times, if timed).
  const applyMove = async (shift: Shift, start: Date, allDay: boolean, end: Date | null) => {
    const patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">> = { date: isoDate(start) };
    if (!allDay) {
      patch.startTime = hhmm(start);
      if (end) patch.endTime = hhmm(end);
    }
    await repo.updateShift(shift.id, patch);
    await reloadShifts();
  };

  const renderChip = (shift: Shift, timeText: string) => {
    const name = shift.placementId ? placementName.get(shift.placementId) : undefined;
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 text-[11px] leading-tight">
        <span className="min-w-0 truncate">
          {timeText && <span className="font-medium">{timeText} </span>}
          {name ?? SHIFT_TYPE_LABEL[shift.shiftType]}
        </span>
        {shift.status === "PLANNED" && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void markWorked(shift.id);
            }}
            aria-label="Mark worked"
            title="Mark worked"
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-black/5"
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
        )}
      </div>
    );
  };

  const sidebar = editing ? (
    <Panel
      title={isShift(editing) ? "Edit shift" : "New shift"}
      hint={isShift(editing) ? undefined : "Fill in the details and save"}
      action={
        isShift(editing) ? (
          <div className="flex gap-3">
            {editing.status === "PLANNED" && (
              <button
                type="button"
                onClick={() => void markWorked(editing.id)}
                className="text-xs font-medium text-emerald-600"
              >
                Mark worked
              </button>
            )}
            <button
              type="button"
              onClick={() => void removeShift(editing)}
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
          isShift(editing)
            ? `edit-${editing.id}`
            : `new-${editing.date}-${editing.startTime ?? ""}-${editing.endTime ?? ""}`
        }
        placements={placements}
        initial={isShift(editing) ? editing : undefined}
        initialDate={isShift(editing) ? undefined : editing.date}
        initialStartTime={isShift(editing) ? undefined : editing.startTime}
        initialEndTime={isShift(editing) ? undefined : editing.endTime}
        onSubmit={submitShift}
        onCancel={() => setEditing(null)}
      />
    </Panel>
  ) : (
    <Panel title="Add a shift" hint="Pick a time on the calendar">
      <p className="text-sm leading-relaxed text-slate-500">
        Click a day — or drag across the hours you worked — and it opens here, ready to save. Click
        an existing shift to edit it.
      </p>
      <button
        type="button"
        onClick={() => setEditing({ date: isoDate(new Date()) })}
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
              eventDurationEditable={false}
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
              dateClick={(arg) => setEditing({ date: arg.dateStr.slice(0, 10) })}
              select={(arg) =>
                setEditing(
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
                if (shift) setEditing(shift);
              }}
              eventDrop={(arg) => {
                const ev = arg.event;
                const shift = ev.extendedProps.shift as Shift | undefined;
                if (shift && ev.start) void applyMove(shift, ev.start, ev.allDay, ev.end);
              }}
            />
          </div>
        </Panel>

        <div className="xl:sticky xl:top-6 xl:self-start">{sidebar}</div>
      </div>
    </div>
  );
}
