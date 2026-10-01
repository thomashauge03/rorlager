import React from "react";
import { AVLOPSROR, varenavn } from "../data";
import { app } from "../tema";
import { Bekreftelse, Felt, Ikon, INNHOLD_B, KANT_X, Knapp, Kort, Kurvlinje, LagerMerke, Side, SKJERM, Topplinje, TOPPLINJE_H } from "./deler";

/*
 * Framsiden (src/pages/Index.tsx i appen): introteksten, «Skann QR-kode»,
 * søket, kategoriene og varekortene. «Bestill til henting» står ikke her:
 * bestilling på nett er slått av i produksjon, og da viser ikke appen den.
 */

const INTRO =
  "Skann QR-koden som henger på hylla, eller søk opp røret i lista under. Tast inn hvor mye du tar ut, og legg det i handlekurven.";

/** Kategoriene med fargeprikken admin har valgt (pipe_categories i produksjon). */
const KATEGORIER: [string, string][] = [
  ["Overvannsrør", "#2f6f9f"],
  ["Avløpsrør", "#5b6b7a"],
  ["Drensrør", "#6b8f3a"],
  ["PE trykkrør", "#1f2933"],
  ["Deler overvann", "#3f8fbf"],
  ["Deler avløp", "#8a7a5a"],
  ["PE-deler", "#4a4a4a"],
  ["Koblinger og kraner", "#a67c00"],
];

/**
 * De første varene i lista. Appen sorterer på navn, så avløpsrørene står
 * øverst. Har varen hylleplass, viser kortet den i stedet for beholdningen
 * (i filmen har 110 mm hylle B3; beholdningen er oppdiktet).
 */
const VARER = [
  { navn: varenavn(AVLOPSROR), kategori: AVLOPSROR.kategori, hylle: AVLOPSROR.hylle, lager: "" },
  { navn: "Avløpsrør PVC 160 mm", kategori: "Avløpsrør", hylle: "", lager: "24 m på lager" },
];

// Intro: tre linjer à 22,75 (text-sm leading-relaxed)
const SKANN_TOPP = TOPPLINJE_H + 16 + 69 + 16;

/** Midten av «Skann QR-kode», i sidens punkter. */
export const SKANN_KNAPP = { x: SKJERM.b / 2, y: SKANN_TOPP + 32 } as const;

const Brikke: React.FC<{ navn: string; farge?: string; valgt?: boolean }> = ({ navn, farge, valgt }) => (
  // h-11 rounded-full border px-4 text-sm font-medium
  <div
    style={{
      height: 44,
      boxSizing: "border-box",
      borderRadius: 999,
      border: `1px solid ${valgt ? app.rod : app.kant}`,
      background: valgt ? app.rod : app.kort,
      color: valgt ? "#fff" : app.blekk,
      padding: "0 16px",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 14,
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}
  >
    {farge && <span style={{ width: 10, height: 10, borderRadius: 999, background: farge, boxShadow: "inset 0 0 0 1px rgba(20,20,20,0.2)" }} />}
    {navn}
  </div>
);

export type ForsideTilstand = {
  /** «Skann QR-kode» trykkes (0–1) */
  skann?: number;
  kurv?: { antall: number; mengde: string };
  bekreftelse?: { tekst: string; synlig: number };
};

export const Forside: React.FC<{ s: ForsideTilstand }> = ({ s }) => (
  <Side>
    <Topplinje tittel="Rørlager" undertittel="Hauge Maskin AS" kurv={s.kurv?.antall ?? 0} />
    <div style={{ position: "absolute", left: KANT_X, top: TOPPLINJE_H + 16, width: INNHOLD_B }}>
      <p style={{ margin: 0, fontSize: 14, lineHeight: "22.75px", color: app.blekkSvak, height: 69 }}>{INTRO}</p>
      <div style={{ marginTop: 16 }}>
        <Knapp tekst="Skann QR-kode" hoyde={64} ikon="kamera" ikonStr={24} skrift={18} fet trykk={s.skann} />
      </div>
      <div style={{ marginTop: 20 }}>
        <Felt verdi="" plassholder="Søk på navn, dimensjon, varenr. eller hylle" venstreIkon="sok" />
      </div>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Brikke navn="Alle" valgt />
        {KATEGORIER.map(([navn, farge]) => (
          <Brikke key={navn} navn={navn} farge={farge} />
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {VARER.map((v) => (
          <Kort key={v.navn} stil={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, lineHeight: "22.5px", fontWeight: 700 }}>{v.navn}</div>
                <div style={{ fontSize: 12, lineHeight: "16px", color: app.blekkSvak }}>{v.kategori}</div>
              </div>
              <LagerMerke />
            </div>
            <div style={{ paddingTop: 4, fontSize: 14, lineHeight: "20px", color: app.blekkSvak, display: "flex", alignItems: "center", gap: 4 }}>
              {v.hylle ? (
                <>
                  <Ikon navn="nal" storrelse={16} />
                  {v.hylle}
                </>
              ) : (
                v.lager
              )}
            </div>
          </Kort>
        ))}
      </div>
    </div>
    {s.kurv && <Kurvlinje antall={s.kurv.antall} mengde={s.kurv.mengde} />}
    {s.bekreftelse && <Bekreftelse tekst={s.bekreftelse.tekst} synlig={s.bekreftelse.synlig} />}
  </Side>
);
