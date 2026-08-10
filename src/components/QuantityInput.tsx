import { useEffect, useId, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { num, parseNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type QuantityInputProps = {
  value: number | null;
  onChange: (v: number | null) => void;
  unit: string;
  step?: number;
  presets?: number[];
  autoFocus?: boolean;
  max?: number;
};

const METER_PRESETS = [1, 5, 10, 25, 50];
const STK_PRESETS = [1, 2, 5, 10];

/** Flyttalsaddisjon gir "12.299999999" – to desimalar er meir enn nok for meter */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function QuantityInput({
  value,
  onChange,
  unit,
  step,
  presets,
  autoFocus,
  max,
}: QuantityInputProps) {
  const fieldId = useId();
  const isStk = unit === "stk";
  const stepValue = step ?? (isStk ? 1 : 0.5);
  const quickValues = presets ?? (isStk ? STK_PRESETS : METER_PRESETS);

  // Feltet må halde sin eigen tekst: "12," og "0" er gyldige mellomsteg som
  // ikkje kan uttrykkjast som tal, og som ikkje skal skrivast om medan ein tastar
  const [text, setText] = useState(value === null ? "" : num(value));
  const editing = useRef(false);

  useEffect(() => {
    if (editing.current) return;
    setText(value === null ? "" : num(value));
  }, [value]);

  const clamp = (n: number) => {
    const limited = max !== undefined && max !== null ? Math.min(n, max) : n;
    return round2(Math.max(limited, 0));
  };

  const commit = (n: number | null) => {
    if (n === null) {
      setText("");
      onChange(null);
      return;
    }
    const next = clamp(n);
    setText(num(next));
    onChange(next);
  };

  const bump = (delta: number) => commit((value ?? 0) + delta);

  const handleText = (raw: string) => {
    // Berre siffer, komma og punktum – bokstavar på talrekkja er alltid ein bom
    const cleaned = raw.replace(/[^0-9.,]/g, "");
    setText(cleaned);
    const parsed = parseNum(cleaned);
    if (parsed === null) {
      onChange(null);
      return;
    }
    onChange(clamp(parsed));
  };

  const atMax = max !== undefined && max !== null && (value ?? 0) >= max;

  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => bump(-stepValue)}
          disabled={(value ?? 0) <= 0}
          aria-label={`Trekk fra ${num(stepValue)} ${unit}`}
          className="h-14 w-14 shrink-0 rounded-lg border border-border bg-card text-foreground flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
        >
          <Minus className="h-6 w-6" aria-hidden="true" />
        </button>

        <div className="relative flex-1 min-w-0">
          <label htmlFor={fieldId} className="sr-only">
            Antall {unit}
          </label>
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={autoFocus}
            value={text}
            onFocus={() => {
              editing.current = true;
            }}
            onBlur={() => {
              editing.current = false;
              setText(value === null ? "" : num(value));
            }}
            onChange={(e) => handleText(e.target.value)}
            placeholder="0"
            className="tabular h-14 w-full rounded-lg border border-input bg-background pl-4 pr-16 text-center text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground"
          >
            {unit}
          </span>
        </div>

        <button
          type="button"
          onClick={() => bump(stepValue)}
          disabled={atMax}
          aria-label={`Legg til ${num(stepValue)} ${unit}`}
          className="h-14 w-14 shrink-0 rounded-lg border border-border bg-card text-foreground flex items-center justify-center transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      {quickValues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickValues.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => bump(p)}
              aria-label={`Legg til ${num(p)} ${unit}`}
              className={cn(
                "tabular h-12 flex-1 min-w-[4.5rem] rounded-lg border border-border bg-card px-3",
                "text-base font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted",
              )}
            >
              +{num(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
