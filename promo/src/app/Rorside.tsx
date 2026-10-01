import React from "react";
import { mengdeTekst, Vare } from "../data";
import { app, RADIUS } from "../tema";
import { Ikon, INNHOLD_B, KANT_X, Knapp, Kort, Kurvlinje, LagerMerke, Side, SKJERM, Topplinje, TOPPLINJE_H } from "./deler";

/*
 * Rørsiden (src/pages/PipePage.tsx + QuantityInput.tsx i appen), med «Vis
 * priser» av: ingen prisrad og ingen sum. Blokkene står på faste plasser,
 * regnet ut fra Tailwind-klassene, så scenene vet hvor fingeren skal trykke.
 */

/** Innsiden av kortene: main px-3, kantlinje 1 og p-4. */
const X = KANT_X + 1 + 16;
const B = INNHOLD_B - 2 - 32;

/** Hurtigknappene i mengdefeltet (METER_PRESETS og STK_PRESETS). */
export const hurtig = (v: Vare) => (v.enhet === "m" ? [1, 5, 10, 25, 50] : [1, 2, 5, 10]);

/**
 * Hurtigknappene er flex-1 med min-w-[4.5rem] og gap-2. På en 440 punkter
 * bred skjerm får fire plass på en rad; den femte (+50) bryter til en egen.
 */
const PER_RAD = 4;
const KNAPP_B = (B - (PER_RAD - 1) * 8) / PER_RAD;

const KORT1 = TOPPLINJE_H + 16;
// Kategori 16 + mt-0.5 + tittel 30 + dimensjon 28, mt-3, tre rader à 36 med skillelinjer
const FAKTA = KORT1 + 1 + 16 + 16 + 2 + 30 + 28 + 12;
const KORT1_BUNN = FAKTA + 1 + 3 * 36 + 2 + 16 + 1;
const KORT2 = KORT1_BUNN + 16;
const FELTRAD = KORT2 + 1 + 16 + 24 + 12;
const HURTIG1 = FELTRAD + 56 + 12;

const hurtigRader = (v: Vare) => Math.ceil(hurtig(v).length / PER_RAD);
const kort2Bunn = (v: Vare) => HURTIG1 + hurtigRader(v) * 48 + (hurtigRader(v) - 1) * 8 + 16 + 1;
const knappTopp = (v: Vare) => kort2Bunn(v) + 16;

/** Midten av en hurtigknapp, i sidens punkter. */
export const hurtigPunkt = (v: Vare, verdi: number) => {
  const i = hurtig(v).indexOf(verdi);
  const rad = Math.floor(i / PER_RAD);
  const iRad = i % PER_RAD;
  const antallIRad = Math.min(PER_RAD, hurtig(v).length - rad * PER_RAD);
  const b = antallIRad === PER_RAD ? KNAPP_B : (B - (antallIRad - 1) * 8) / antallIRad;
  return { x: X + iRad * (b + 8) + b / 2, y: HURTIG1 + rad * 56 + 24 };
};

/** Midten av «Legg i handlekurv», i sidens punkter. */
export const leggIKurvPunkt = (v: Vare) => ({ x: SKJERM.b / 2, y: knappTopp(v) + 32 });

/** Tallet i mengdefeltet, i sidens punkter (for å la det rulle). */
export const MENGDEFELT = { y: FELTRAD } as const;

const Fakta: React.FC<{ etikett: string; verdi: string; forste?: boolean }> = ({ etikett, verdi, forste }) => (
  // flex items-baseline justify-between gap-4 py-2, divide-y
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "8px 0", borderTop: forste ? undefined : `1px solid ${app.kant}` }}>
    <span style={{ fontSize: 14, lineHeight: "20px", color: app.blekkSvak }}>{etikett}</span>
    <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, color: app.blekk }}>{verdi}</span>
  </div>
);

/** Kvadratisk −/+ med kant: h-14 w-14 rounded-lg border bg-card */
const PlussMinus: React.FC<{ ikon: "pluss" | "minus"; av?: boolean }> = ({ ikon, av }) => (
  <div
    style={{
      width: 56,
      height: 56,
      flexShrink: 0,
      boxSizing: "border-box",
      borderRadius: RADIUS.lg,
      border: `1px solid ${app.kant}`,
      background: app.kort,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: app.blekk,
      opacity: av ? 0.4 : 1,
    }}
  >
    <Ikon navn={ikon} storrelse={24} />
  </div>
);

/** Tallet ruller opp når det endrer seg: `fra` → `til` med p 0–1. */
const RullTall: React.FC<{ fra: number | null; til: number | null; p: number }> = ({ fra, til, p }) => {
  const vis = (n: number | null) => (n === null ? "0" : n.toLocaleString("nb-NO"));
  const farge = (n: number | null) => (n === null ? "rgba(92,92,92,0.5)" : app.blekk);
  if (p <= 0 || p >= 1 || fra === til) {
    const n = p >= 1 ? til : fra;
    return <span style={{ color: farge(n) }}>{vis(n)}</span>;
  }
  return (
    <span style={{ position: "relative", display: "inline-block", height: 36, overflow: "hidden", verticalAlign: "middle" }}>
      <span style={{ display: "block", transform: `translateY(${-p * 36}px)`, color: farge(fra), lineHeight: "36px" }}>{vis(fra)}</span>
      <span style={{ display: "block", transform: `translateY(${-p * 36}px)`, color: farge(til), lineHeight: "36px" }}>{vis(til)}</span>
    </span>
  );
};

export type RorsideTilstand = {
  vare: Vare;
  /** Mengden i feltet: forrige og ny verdi, og hvor langt tallet har rullet */
  mengde: { fra: number | null; til: number | null; p: number };
  /** Hurtigknappen som er trykt ned akkurat nå, og hvor hardt (0–1) */
  trykket?: { verdi: number; p: number };
  /** «Legg i handlekurv» trykkes (0–1) */
  legg?: number;
  /** 0–1: knappene er av til det står en mengde i feltet, og går over til på */
  knapperAv?: number;
  /** Varer allerede i kurven: merket i topplinja og kurvlinja nederst */
  kurv?: { antall: number; mengde: string };
};

export const Rorside: React.FC<{ s: RorsideTilstand }> = ({ s }) => {
  const v = s.vare;
  const verdier = hurtig(v);
  const tom = (s.mengde.p >= 1 ? s.mengde.til : s.mengde.fra) === null;
  return (
    <Side>
      <Topplinje tittel="Rørlager" tilbake kurv={s.kurv?.antall ?? 0} />

      {/* Overskriften: kategori, navn, dimensjon, lagerstatus og fakta */}
      <div style={{ position: "absolute", left: KANT_X, top: KORT1, width: INNHOLD_B }}>
        <Kort stil={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.025em", textTransform: "uppercase", color: app.rod }}>{v.kategori}</div>
              <div style={{ marginTop: 2, fontSize: 24, lineHeight: "30px", fontWeight: 700, color: app.blekk }}>{v.navn}</div>
              <div style={{ fontSize: 20, lineHeight: "28px", fontWeight: 600, color: app.blekkSvak }}>{v.dimensjon}</div>
            </div>
            <LagerMerke />
          </div>
          <div style={{ marginTop: 12, borderTop: `1px solid ${app.kant}` }}>
            <Fakta etikett="Varenummer" verdi={v.varenr} forste />
            <Fakta etikett="Hylleplass" verdi={v.hylle} />
            <Fakta etikett="På lager" verdi={mengdeTekst(v.lager, v.enhet)} />
          </div>
        </Kort>
      </div>

      {/* Mengden */}
      <div style={{ position: "absolute", left: KANT_X, top: KORT2, width: INNHOLD_B }}>
        <Kort stil={{ padding: 16 }}>
          <div style={{ fontSize: 16, lineHeight: "24px", fontWeight: 600, marginBottom: 12 }}>Hvor mye tar du ut?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <PlussMinus ikon="minus" av={tom} />
            <div
              style={{
                position: "relative",
                flex: 1,
                height: 56,
                boxSizing: "border-box",
                borderRadius: RADIUS.lg,
                border: `1px solid ${app.kant}`,
                background: app.bakgrunn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                paddingRight: 48,
                paddingLeft: 16,
              }}
            >
              <RullTall fra={s.mengde.fra} til={s.mengde.til} p={s.mengde.p} />
              <span style={{ position: "absolute", right: 16, top: 16, fontSize: 16, lineHeight: "24px", fontWeight: 600, color: app.blekkSvak }}>{v.enhet}</span>
            </div>
            <PlussMinus ikon="pluss" />
          </div>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {verdier.map((n) => {
              const nede = s.trykket?.verdi === n ? s.trykket.p : 0;
              return (
                <div
                  key={n}
                  style={{
                    flex: 1,
                    minWidth: 72,
                    height: 48,
                    boxSizing: "border-box",
                    borderRadius: RADIUS.lg,
                    border: `1px solid ${app.kant}`,
                    background: nede > 0.3 ? app.dempet : app.kort,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: app.blekk,
                  }}
                >
                  +{n}
                </div>
              );
            })}
          </div>
        </Kort>
      </div>

      {/* Knappene */}
      <div style={{ position: "absolute", left: KANT_X, top: knappTopp(v), width: INNHOLD_B, display: "flex", flexDirection: "column", gap: 8 }}>
        <Knapp tekst="Legg i handlekurv" hoyde={64} ikon="pluss" ikonStr={24} skrift={18} fet trykk={s.legg} av={s.knapperAv} />
        <Knapp tekst="Legg til og gå til kurv" variant="kontur" hoyde={48} ikon="kurv" ikonEtter="pilHoyre" av={s.knapperAv} />
        <Knapp tekst="Tilbake til oversikten" variant="spokelse" hoyde={48} ikon="hjem" />
      </div>

      {s.kurv && <Kurvlinje antall={s.kurv.antall} mengde={s.kurv.mengde} />}
    </Side>
  );
};
