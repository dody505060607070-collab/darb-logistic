import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterChoices, resolveChoice, type ChoiceOption } from "@/lib/choice";

/**
 * A list you can pick from or type into. `value` is the stored option value;
 * typed text that is not in the list is passed up as-is so the form decides
 * whether to save it, create it, or ask for a listed value.
 */
export function ChoiceInput({
  value,
  onChange,
  options,
  placeholder = "اختر من القائمة أو اكتب بنفسك",
  required,
  id,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ChoiceOption[];
  placeholder?: string;
  required?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const labelOf = (v: string) => options.find(([o]) => o === v)?.[1] ?? v;
  const [text, setText] = useState(() => labelOf(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const dirty = useRef(false);
  const emitted = useRef<string | null>(null);
  const shownLabel = labelOf(value);

  useEffect(() => {
    if (!dirty.current || value !== emitted.current) {
      setText(shownLabel);
      dirty.current = false;
    }
  }, [value, shownLabel]);

  const list = useMemo(() => filterChoices(text, options, shownLabel), [text, options, shownLabel]);

  function type(next: string) {
    dirty.current = true;
    setText(next);
    setOpen(true);
    setActive(-1);
    const r = resolveChoice(next, options);
    const out = r.kind === "match" ? r.value : r.kind === "custom" ? r.text : "";
    emitted.current = out;
    onChange(out);
  }

  function pick([v, l]: ChoiceOption) {
    dirty.current = true;
    emitted.current = v;
    setText(l);
    setOpen(false);
    onChange(v);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && active >= 0 && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  }

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        required={required}
        placeholder={placeholder}
        onChange={(e) => type(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        className="h-9 w-full rounded-md border border-input bg-card pe-9 ps-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="عرض القائمة"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-muted-foreground"
      >
        <ChevronDown className="size-4" />
      </button>
      {open && list.length > 0 && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
          {list.map((o, i) => (
            <li
              key={o[0]}
              role="option"
              aria-selected={o[0] === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              className={cn("cursor-pointer rounded px-2 py-1.5 hover:bg-accent hover:text-accent-foreground", (i === active || o[0] === value) && "bg-accent text-accent-foreground")}
            >
              {o[1]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
