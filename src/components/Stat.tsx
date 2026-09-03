import type { ReactNode } from "react";

/**
 * Eit nøkkeltal: etikett over, tal under, i ei hm-stat-rute.
 *
 * Låg tidlegare privat inne i OrdersTab. Flytta hit fordi prosjektsidene
 * skreiv same ruta for hand med inline span-ar – og JSX et mellomrommet mellom
 * to element som berre er skilde av eit linjeskift, så det sto «Ventet02.09.26»
 * på skjermen. Ei felles komponent kan ikkje gjere den feilen fem stader.
 */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="hm-stat">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 text-lg font-bold leading-tight text-foreground">{value}</p>
    </div>
  );
}
