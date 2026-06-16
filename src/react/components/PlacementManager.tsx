import { useState } from "react";
import type { Placement } from "../../domain/types";
import { btnGhost, inputCls } from "./ui";

export function PlacementManager({
  placements,
  onCreate,
}: {
  placements: Placement[];
  onCreate: (name: string, settingType?: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [setting, setSetting] = useState("");

  const add = async () => {
    if (name.trim() === "") return;
    await onCreate(name.trim(), setting.trim() || undefined);
    setName("");
    setSetting("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ward or team, e.g. Ward 7"
          className={`${inputCls} flex-1`}
        />
        <input
          type="text"
          value={setting}
          onChange={(e) => setSetting(e.target.value)}
          placeholder="Setting (optional)"
          className={`${inputCls} sm:w-44`}
        />
        <button type="button" onClick={add} className={btnGhost}>
          Add
        </button>
      </div>
      {placements.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {placements.map((p) => (
            <li
              key={p.id}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/60"
            >
              {p.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">Add the ward or team you're working on.</p>
      )}
    </div>
  );
}
