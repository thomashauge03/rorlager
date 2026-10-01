import React from "react";
import { mengdeTekst, UTTAKET, varenavn } from "../data";
import { app } from "../tema";
import { Etikett, Felt, FELT_H, Hint, Ikon, INNHOLD_B, KANT_X, Knapp, Kort, Side, SKJERM, Topplinje, TOPPLINJE_H } from "./deler";

/*
 * Kassen (src/pages/Checkout.tsx i appen) for en kunde uten innlogging:
 * «Dette tar du ut», skjemaet og «Send inn uttak» i den faste bunnen
 * (FastBunn). Prisene er av, så det står ingen sum. Signatur er av i
 * produksjon, så den står ikke her heller.
 *
 * Siden ruller under topplinja (sticky), som i en nettleser.
 */

export type Kassefelt = "navn" | "telefon" | "epost" | "firma" | "prosjekt";

const OPPSUMMERING = TOPPLINJE_H + 16;
// Kort: p-4, overskrift 24, mt-3, to rader à 36 med skillelinje, mt-3, lenka 20
const OPPSUMMERING_H = 1 + 16 + 24 + 12 + 36 + 1 + 36 + 12 + 20 + 16 + 1;
const SKJEMA = OPPSUMMERING + OPPSUMMERING_H + 16 + 1 + 16;

/** Toppen av hvert felt (inntastingsruta, ikke etiketten), i sidens punkter. */
const FELT_TOPP = (() => {
  const etikett = 14 + 6;
  let y = SKJEMA;
  const navn = y + etikett;
  y = navn + FELT_H + 16;
  const telefon = y + etikett;
  y = telefon + FELT_H + 16;
  const epost = y + etikett;
  y = epost + FELT_H + 6 + 32 + 16;
  const firma = y + etikett;
  y = firma + FELT_H + 16;
  const prosjekt = y + etikett;
  y = prosjekt + FELT_H + 6 + 16 + 16;
  return { navn, telefon, epost, firma, prosjekt, kommentar: y };
})();

/** Midten av et felt, i sidens punkter (før rulling). */
export const kasseFelt = (felt: Kassefelt) => ({ x: SKJERM.b / 2, y: FELT_TOPP[felt] + FELT_H / 2 });

/** Den faste bunnen: border-t, pt-3, knappen h-14 og pb-3. */
export const BUNN_H = 1 + 12 + 56 + 12;
/** Midten av «Send inn uttak», i skjermens punkter (bunnen står fast). */
export const SEND_KNAPP = { x: SKJERM.b / 2, y: SKJERM.h - 12 - 28 } as const;

export type KasseTilstand = {
  /** Firma står tomt i filmen: kunden hopper over det med «Neste» */
  verdier: Record<Exclude<Kassefelt, "firma">, string>;
  fokus: Kassefelt | null;
  markor: boolean;
  /** Hvor langt siden er rullet */
  rull: number;
  /** Den faste bunnen: 0 = gjemt (tastaturet er oppe), 1 = synlig */
  bunn: number;
  /** «Send inn uttak» trykkes (0–1) */
  send?: number;
  /** Sendes inn: spinneren roterer (grader) */
  sender?: number;
};

export const TOMT: KasseTilstand = {
  verdier: { navn: "", telefon: "", epost: "", prosjekt: "" },
  fokus: null,
  markor: false,
  rull: 0,
  bunn: 1,
};

const Feltblokk: React.FC<{
  etikett: string;
  pakrevd?: boolean;
  verdi: string;
  plassholder: string;
  fokus: boolean;
  markor: boolean;
  hint?: string;
  hintHoyde?: number;
}> = ({ etikett, pakrevd, verdi, plassholder, fokus, markor, hint, hintHoyde = 16 }) => (
  // space-y-1.5: etikett, felt, hint
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <Etikett tekst={etikett} pakrevd={pakrevd} />
    <Felt verdi={verdi} plassholder={plassholder} fokus={fokus} markor={markor} />
    {hint && (
      <div style={{ height: hintHoyde }}>
        <Hint>{hint}</Hint>
      </div>
    )}
  </div>
);

export const Kasse: React.FC<{ s: KasseTilstand }> = ({ s }) => {
  const v = s.verdier;
  const f = (navn: Kassefelt) => s.fokus === navn;
  return (
    <Side>
      <div style={{ position: "absolute", left: 0, top: 0, width: SKJERM.b, transform: `translateY(${-s.rull}px)` }}>
        {/* Oppsummeringen: det siste kunden ser før han sender inn */}
        <div style={{ position: "absolute", left: KANT_X, top: OPPSUMMERING, width: INNHOLD_B }}>
          <Kort stil={{ padding: 16 }}>
            <div style={{ fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>Dette tar du ut</div>
            <div style={{ marginTop: 12 }}>
              {UTTAKET.map(({ vare, mengde }, i) => (
                <div
                  key={vare.kode}
                  style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: i > 0 ? `1px solid ${app.kant}` : undefined }}
                >
                  <span style={{ fontSize: 14, lineHeight: "20px" }}>{varenavn(vare)}</span>
                  <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{mengdeTekst(mengde, vare.enhet)}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 14, lineHeight: "20px", fontWeight: 500, color: app.rod }}>Endre handlekurven</div>
          </Kort>
        </div>

        {/* Skjemaet */}
        <div style={{ position: "absolute", left: KANT_X, top: SKJEMA - 17, width: INNHOLD_B }}>
          <Kort stil={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            <Feltblokk etikett="Navn" pakrevd verdi={v.navn} plassholder="Ola Nordmann" fokus={f("navn")} markor={s.markor} />
            <Feltblokk etikett="Telefon" pakrevd verdi={v.telefon} plassholder="900 00 000" fokus={f("telefon")} markor={s.markor} />
            <Feltblokk
              etikett="E-post"
              pakrevd
              verdi={v.epost}
              plassholder="ola@firma.no"
              fokus={f("epost")}
              markor={s.markor}
              hint="Brukes hvis vi må sende deg dokumentasjon. Har du ikke e-post, skriv «ingen»."
              hintHoyde={32}
            />
            <Feltblokk etikett="Firma" verdi="" plassholder="Firmanavn" fokus={f("firma")} markor={s.markor} />
            <Feltblokk
              etikett="Prosjekt eller adresse"
              verdi={v.prosjekt}
              plassholder="Byggefelt Vest, tomt 4"
              fokus={f("prosjekt")}
              markor={s.markor}
              hint="Hvor skal rørene brukes?"
            />
            <div style={{ height: 44, display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, color: app.rod }}>
              <Ikon navn="pluss" storrelse={16} />
              Legg til kommentar
            </div>
          </Kort>
          <p style={{ margin: "16px 0 0", fontSize: 12, lineHeight: "16px", textAlign: "center", color: app.blekkSvak }}>
            Vi lagrer navn og mobilnummer for å kunne fakturere uttaket.{" "}
            <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>Slik behandler vi opplysningene</span>.
          </p>
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, top: 0, width: SKJERM.b }}>
        <Topplinje tittel="Send inn uttak" tilbake />
      </div>

      {/* Den faste bunnen, som viker mens tastaturet er oppe */}
      {s.bunn > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: BUNN_H,
            boxSizing: "border-box",
            borderTop: `1px solid ${app.kant}`,
            background: "rgba(247,247,247,0.95)",
            padding: "12px 12px",
            opacity: s.bunn,
          }}
        >
          <Knapp
            tekst={s.sender !== undefined ? "Sender inn …" : "Send inn uttak"}
            hoyde={56}
            ikon="send"
            ikonStr={24}
            skrift={18}
            fet
            trykk={s.send}
            spinner={s.sender}
          />
        </div>
      )}
    </Side>
  );
};
