import { useState } from "react";
import { Link } from "react-router-dom";
import type { Placement } from "../../domain/types";
import { btnGhost, btnGhostSm, inputCls } from "./ui";

function IconPencil() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

export function PlacementManager({
  placements,
  onCreate,
  onUpdate,
  onDelete,
}: {
  placements: Placement[];
  onCreate: (name: string, settingType?: string) => void | Promise<void>;
  onUpdate: (id: string, patch: { name: string; settingType?: string }) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [setting, setSetting] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSetting, setEditSetting] = useState("");

  const add = async () => {
    if (name.trim() === "") return;
    await onCreate(name.trim(), setting.trim() || undefined);
    setName("");
    setSetting("");
  };

  const startEdit = (p: Placement) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditSetting(p.settingType ?? "");
  };

  const saveEdit = async () => {
    if (editingId === null || editName.trim() === "") return;
    await onUpdate(editingId, {
      name: editName.trim(),
      settingType: editSetting.trim() || undefined,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ward or team, e.g. Ward 7"
          className={`${inputCls} flex-1`}
        />
        <input
          type="text"
          value={setting}
          onChange={(e) => setSetting(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Setting (optional)"
          className={`${inputCls} sm:w-44`}
        />
        <button type="button" onClick={add} className={btnGhost}>
          Add
        </button>
      </div>

      {placements.length > 0 ? (
        <ul className="space-y-1.5">
          {placements.map((p) => (
            <li key={p.id} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/60">
              {editingId === p.id ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className={`${inputCls} flex-1`}
                    aria-label="Placement name"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editSetting}
                    onChange={(e) => setEditSetting(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    placeholder="Setting (optional)"
                    className={`${inputCls} sm:w-40`}
                    aria-label="Setting"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEdit} className={btnGhostSm}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className={btnGhostSm}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate">
                    <Link
                      to={`/placements/${p.id}`}
                      className="text-sm font-medium text-slate-700 hover:text-emerald-700"
                    >
                      {p.name}
                    </Link>
                    {p.settingType && (
                      <span className="ml-2 text-xs text-slate-400">{p.settingType}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      aria-label={`Rename ${p.name}`}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <IconPencil />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p.id)}
                      aria-label={`Delete ${p.name}`}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">Add the ward or team you're working on.</p>
      )}
    </div>
  );
}
