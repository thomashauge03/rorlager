import React from "react";
import { UTTAKET, varenavn } from "../data";
import { app, RADIUS } from "../tema";
import { Ikon, INNHOLD_B, KANT_X, Knapp, Kort, Side, SKJERM, Topplinje, TOPPLINJE_H } from "./deler";

/*
 * Handlekurven (src/pages/Cart.tsx i appen) med de to varene. Prisene er av,
 * så det står ingen linjesum og ingen sum. Mengdefeltet er den kompakte
 * utgaven uten hurtigknapper.
 */

// Hvert kort: p-4, navn 20, mt-0.5, varenr-linje 16, mt-3, feltet 56
const KORT_H = 1 + 16 + 20 + 2 + 16 + 12 + 56 + 16 + 1;
const GA_VIDERE_TOPP = TOPPLINJE_H + 16 + 2 * KORT_H + 12 + 16;

/** Midten av «Gå videre», i sidens punkter. */
export const GA_VIDERE = { x: SKJERM.b / 2, y: GA_VIDERE_TOPP + 32 } as const;

const Linje: React.FC<{ navn: string; varenr: string; hylle: string; mengde: number; enhet: string }> = ({ navn, varenr, hylle, mengde, enhet }) => (
  <Kort stil={{ padding: 16 }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, height: 38 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, lineHeight: "20px", fontWeight: 700 }}>{navn}</div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 12, fontSize: 12, lineHeight: "16px", color: app.blekkSvak }}>
          <span>Varenr. {varenr}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Ikon navn="nal" storrelse={14} />
            {hylle}
          </span>
        </div>
      </div>
      <div style={{ width: 44, height: 44, marginRight: -4, marginTop: -4, display: "flex", alignItems: "center", justifyContent: "center", color: app.blekkSvak }}>
        <Ikon navn="soppel" />
      </div>
    </div>
    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
      {(["minus", "tall", "pluss"] as const).map((del) =>
        del === "tall" ? (
          <div
            key={del}
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
            {mengde.toLocaleString("nb-NO")}
            <span style={{ position: "absolute", right: 16, top: 16, fontSize: 16, lineHeight: "24px", fontWeight: 600, color: app.blekkSvak }}>{enhet}</span>
          </div>
        ) : (
          <div
            key={del}
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
            }}
          >
            <Ikon navn={del} storrelse={24} />
          </div>
        ),
      )}
    </div>
  </Kort>
);

export const Kurv: React.FC<{ videre?: number }> = ({ videre }) => (
  <Side>
    <Topplinje tittel="Handlekurv" undertittel={`${UTTAKET.length} varer`} tilbake />
    <div style={{ position: "absolute", left: KANT_X, top: TOPPLINJE_H + 16, width: INNHOLD_B, display: "flex", flexDirection: "column", gap: 12 }}>
      {UTTAKET.map(({ vare, mengde }) => (
        <Linje key={vare.kode} navn={varenavn(vare)} varenr={vare.varenr} hylle={vare.hylle} mengde={mengde} enhet={vare.enhet} />
      ))}
    </div>
    <div style={{ position: "absolute", left: KANT_X, top: GA_VIDERE_TOPP, width: INNHOLD_B, display: "flex", flexDirection: "column", gap: 0 }}>
      <Knapp tekst="Gå videre" hoyde={64} ikonEtter="pilHoyre" ikonStr={24} skrift={18} fet trykk={videre} />
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Knapp tekst="Legg til flere rør" variant="kontur" hoyde={48} />
        <Knapp tekst="Tøm handlekurv" variant="spokelse" hoyde={48} ikon="soppel" />
      </div>
    </div>
  </Side>
);
