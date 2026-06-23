import { useMemo, useState } from "react";
import { inputCls } from "../ui";

const MAX = 8;

function substringMatches(
  options: readonly string[],
  query: string,
  exclude?: Set<string>,
): string[] {
  const q = query.trim().toLowerCase();
  return options
    .filter((o) => !exclude?.has(o.toLowerCase()) && (q === "" || o.toLowerCase().includes(q)))
    .slice(0, MAX);
}

const menuCls =
  "absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg";

function optionCls(activeRow: boolean) {
  return (
    "flex w-full px-3 py-1.5 text-left text-sm " +
    (activeRow ? "bg-emerald-50 text-emerald-700" : "text-slate-700 hover:bg-slate-50")
  );
}

/**
 * A single-value combobox: a free-text input with a type-ahead dropdown of
 * substring matches from `options` (a stubbed BNF list). Picking a suggestion fills
 * the field; the student can also type anything not in the list.
 */
export function Autocomplete({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const matches = useMemo(() => substringMatches(options, value), [options, value]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const choose = (v: string) => {
    onChange(v);
    close();
  };

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        className={inputCls}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(close, 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && active >= 0 && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            close();
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className={menuCls}>
          {matches.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={optionCls(i === active)}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A multi-value tag input stored as a comma-separated string (like `routes`). Type
 * to see substring matches from `options`; pick or press Enter to add a chip (free
 * text allowed), Backspace on an empty field removes the last chip.
 */
export function TagInput({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (csv: string) => void;
  options: readonly string[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const tags = useMemo(
    () =>
      value
        ? value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    [value],
  );
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const matches = useMemo(() => {
    const exclude = new Set(tags.map((t) => t.toLowerCase()));
    return substringMatches(options, q, exclude);
  }, [options, q, tags]);

  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v].join(", "));
    }
    setQ("");
    setActive(-1);
    setOpen(false);
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t).join(", "));

  return (
    <div>
      {tags.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li
              key={t}
              className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
            >
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Remove ${t}`}
                className="text-slate-400 transition hover:text-rose-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          autoComplete="off"
          value={q}
          placeholder={placeholder}
          className={inputCls}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(active >= 0 && matches[active] ? matches[active] : q);
            } else if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            } else if (e.key === "Backspace" && q === "" && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
        />
        {open && matches.length > 0 && (
          <ul className={menuCls}>
            {matches.map((o, i) => (
              <li key={o}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => add(o)}
                  className={optionCls(i === active)}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
