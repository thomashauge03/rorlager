import React from "react";
import { KUNDE, KVITTERING, mengdeTekst, UTTAKET, varenavn } from "../data";
import { app, RADIUS } from "../tema";
import { Ikon, INNHOLD_B, KANT_X, Knapp, Kort, Side, Topplinje, TOPPLINJE_H } from "./deler";

/*
 * Kvitteringen (src/pages/Receipt.tsx i appen): «Uttaket er registrert»,
 * uttaksnummeret og tiden, varene, prosjektet, «Last ned PDF» og «Nytt
 * uttak». Prisene er av, så det står ingen sum.
 */

export const Kvittering: React.FC<{ /** 0–1: boksen skaleres inn (animate-scale-in) */ inn?: number }> = ({ inn = 1 }) => (
  <Side>
    <Topplinje tittel="Kvittering" />
    <div style={{ position: "absolute", left: KANT_X, top: TOPPLINJE_H + 16, width: INNHOLD_B }}>
      {/* rounded-lg border border-success/30 bg-success/10 p-6 text-center */}
      <div
        style={{
          borderRadius: RADIUS.lg,
          border: "1px solid rgba(41,163,122,0.3)",
          background: "rgba(41,163,122,0.1)",
          padding: 24,
          textAlign: "center",
          opacity: inn,
          transform: `scale(${0.85 + 0.15 * inn})`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Ikon navn="hake" storrelse={48} farge={app.gronn} />
        </div>
        <div style={{ marginTop: 12, fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>Uttaket er registrert</div>
        <div style={{ marginTop: 4, fontSize: 14, lineHeight: "20px", color: app.blekkSvak, fontVariantNumeric: "tabular-nums" }}>
          Uttak nr. <span style={{ fontWeight: 600, color: app.blekk }}>{KVITTERING.nr}</span> · {KVITTERING.tid}
        </div>
      </div>

      <Kort stil={{ marginTop: 16, padding: 16 }}>
        <div style={{ fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>Varer</div>
        <div style={{ marginTop: 12 }}>
          {UTTAKET.map(({ vare, mengde }, i) => (
            <div
              key={vare.kode}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: i > 0 ? `1px solid ${app.kant}` : undefined }}
            >
              <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>{varenavn(vare)}</span>
              <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{mengdeTekst(mengde, vare.enhet)}</span>
            </div>
          ))}
        </div>
      </Kort>

      <Kort stil={{ marginTop: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, padding: "6px 0" }}>
          <span style={{ fontSize: 14, lineHeight: "20px", color: app.blekkSvak }}>Prosjekt</span>
          <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>{KUNDE.prosjekt}</span>
        </div>
      </Kort>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <Knapp tekst="Last ned PDF" variant="kontur" hoyde={56} ikon="last" />
        <Knapp tekst="Nytt uttak" hoyde={64} ikon="hjem" ikonStr={24} skrift={18} fet />
      </div>
    </div>
  </Side>
);
