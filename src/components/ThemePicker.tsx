import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Lys", Icon: Sun },
  { value: "dark", label: "Mørk", Icon: Moon },
  { value: "system", label: "Følg enheten", Icon: Monitor },
] as const;

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // Temaet er ukjent til komponenten er montert i nettlesaren; utan dette
  // ville feil val stått markert i eit kort augeblikk
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Fargetema">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`flex-1 min-w-[7.5rem] rounded-lg border px-3 py-3 text-sm transition-colors ${
              active
                ? "border-primary bg-primary/10 text-primary font-semibold"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5 mx-auto mb-1.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
