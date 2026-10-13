// Prisane kunden ser: inkl. mva stort, eks. mva under.
//
// Prisane i basen er eks. mva. Uttaksflyten viste dei utan merking, så ein
// privatperson såg prisar som i praksis var 25 % for låge – og prisopplysnings-
// forskrifta krev totalpris inkl. mva til forbrukar. Bedrifter les eks. mva,
// så begge står. Same oppsett som butikken på /bestill har hatt frå starten.

import { kr } from "@/lib/format";
import { prisInklMva, summer } from "@/lib/mva";

/** Pris per eining. Null er «Avtales», som før. */
export function Pris({
  price,
  unit,
  vat,
  align = "right",
}: {
  price: number | null;
  unit: string;
  vat: number;
  align?: "left" | "right";
}) {
  if (price === null) return <span className="block text-sm font-medium text-muted-foreground">Pris avtales</span>;
  return (
    <span className={align === "right" ? "block text-right" : "block"}>
      <span className="tabular block font-semibold text-foreground">
        {kr(prisInklMva(price, vat))} kr/{unit} <span className="text-xs font-normal text-muted-foreground">inkl. mva</span>
      </span>
      <span className="tabular block text-xs text-muted-foreground">{kr(price)} kr eks. mva</span>
    </span>
  );
}

/** Ein sum: inkl. mva som tal, og eks. mva i ein liten linje under. */
export function Sum({
  eks,
  vat,
  className = "text-2xl",
}: {
  /** Summen eks. mva, slik han står i kurva og på ordren. */
  eks: number;
  vat: number;
  /** Storleiken på hovudtalet. */
  className?: string;
}) {
  const s = summer([eks], vat);
  return (
    <span className="block text-right">
      <span className={`tabular block font-bold text-foreground ${className}`}>{kr(s.inkl)} kr</span>
      <span className="tabular block text-xs text-muted-foreground">
        inkl. {kr(s.mva)} kr mva · {kr(s.eks)} kr eks. mva
      </span>
    </span>
  );
}
