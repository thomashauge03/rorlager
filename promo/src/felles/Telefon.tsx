import React from "react";
import { geist } from "../fonter";

/** Skjermen i punkter, samme som i Leveringsseddel-filmen. */
export const SKJERM_B = 440;
export const SKJERM_H = 957;
/** Statuslinja øverst på skjermen. Innholdet starter under den. */
export const STATUS_H = 40;
const KANT = 12;
export const TELEFON_B = SKJERM_B + 2 * KANT;
export const TELEFON_H = SKJERM_H + 2 * KANT;

/**
 * En nøytral mobiltelefon, ikke en bestemt modell. Hele telefonen skaleres
 * med CSS `zoom`, så skjerminnholdet tegnes skarpt i sin endelige størrelse
 * (en transform-skala forstørrer et ferdig rastrert lag — det var derfor
 * første Leveringsseddel-film ble uskarp).
 */
export const Telefon: React.FC<{
  zoom?: number;
  klokke?: string;
  /** Lys statuslinje (svart tekst) når innholdet øverst er lyst */
  lysStatus?: boolean;
  /**
   * Bakgrunnen bak statuslinja. Rørlagerets topplinje (#171717) går helt opp
   * bak den, så skjøten ikke skal synes; kameraet er svart.
   */
  statusFarge?: string;
  children: React.ReactNode;
  /** Legges over skjerminnholdet: finger, tastatur, ark */
  over?: React.ReactNode;
}> = ({ zoom = 1, klokke = "07:12", lysStatus = false, statusFarge, children, over }) => {
  const tekst = lysStatus ? "#000" : "#fff";
  return (
    <div style={{ zoom, position: "relative", width: TELEFON_B, height: TELEFON_H }}>
      {/* Knappene på sidene */}
      {[
        { side: "left", top: 180, h: 34 },
        { side: "left", top: 238, h: 64 },
        { side: "left", top: 314, h: 64 },
        { side: "right", top: 262, h: 104 },
      ].map((k, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            [k.side]: -3,
            top: k.top,
            width: 4,
            height: k.h,
            borderRadius: 2,
            background: "linear-gradient(90deg, #26282b, #55585e, #26282b)",
          }}
        />
      ))}
      {/* Rammen: tynn metallkant rundt en svart glasskant */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 62,
          padding: 2.5,
          background: "linear-gradient(150deg, #6b6e74 0%, #2a2b2e 22%, #17181a 50%, #2d2f33 78%, #74777d 100%)",
          boxShadow: "0 60px 120px rgba(0,0,0,0.75), 0 20px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ width: "100%", height: "100%", borderRadius: 60, background: "#050505", padding: KANT - 2.5 }}>
          <div
            style={{
              width: SKJERM_B,
              height: SKJERM_H,
              borderRadius: 48,
              overflow: "hidden",
              position: "relative",
              background: "#0b0b0c",
              fontFamily: geist,
            }}
          >
            <div style={{ position: "absolute", left: 0, top: STATUS_H, width: SKJERM_B, height: SKJERM_H - STATUS_H, overflow: "hidden" }}>
              {children}
            </div>
            {over}
            {/* Statuslinja */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: STATUS_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "2px 30px 0 34px",
                color: tekst,
                fontSize: 15,
                fontWeight: 600,
                zIndex: 30,
                background: statusFarge ?? (lysStatus ? "#fff" : "#0b0b0c"),
              }}
            >
              <span style={{ letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" }}>{klokke}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="17" height="11" viewBox="0 0 18 12" fill={tekst}>
                  <rect x="0" y="8" width="3" height="4" rx="1" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                  <rect x="10" y="3" width="3" height="9" rx="1" />
                  <rect x="15" y="0" width="3" height="12" rx="1" />
                </svg>
                <svg width="15" height="11" viewBox="0 0 16 12" fill={tekst}>
                  <path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.1-1.2C13.4 1.6 10.8.5 8 .5S2.6 1.6.7 3.5l1.1 1.2C3.4 3.1 5.6 2.2 8 2.2Z" />
                  <path d="M8 5.6c1.5 0 2.8.5 3.8 1.5l1.1-1.2C11.6 4.6 9.9 3.9 8 3.9s-3.6.7-4.9 2l1.1 1.2c1-1 2.3-1.5 3.8-1.5Z" />
                  <path d="M8 9.1c.6 0 1.1.2 1.5.6L8 11.3 6.5 9.7c.4-.4.9-.6 1.5-.6Z" />
                </svg>
                <svg width="26" height="12" viewBox="0 0 27 13" fill="none">
                  <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={tekst} opacity="0.4" />
                  <rect x="2" y="2" width="16" height="9" rx="2" fill={tekst} />
                  <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill={tekst} opacity="0.45" />
                </svg>
              </span>
            </div>
            {/* Kamerahullet */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                width: 14,
                height: 14,
                marginLeft: -7,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #2a3140, #050505 60%)",
                zIndex: 31,
              }}
            />
            {/* Hjemstreken */}
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: "50%",
                width: 140,
                height: 5,
                marginLeft: -70,
                borderRadius: 3,
                background: "rgba(0,0,0,0.8)",
                zIndex: 32,
              }}
            />
          </div>
        </div>
      </div>
      {/* Glassrefleks over skjermen */}
      <div
        style={{
          position: "absolute",
          inset: KANT,
          borderRadius: 48,
          background: "linear-gradient(112deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.04) 100%)",
          pointerEvents: "none",
          zIndex: 40,
        }}
      />
    </div>
  );
};
