import React from "react";
import { AbsoluteFill, Composition, Folder } from "remotion";
import { Forside } from "./app/Forside";
import { Kamera } from "./app/Kamera";
import { Kasse, TOMT } from "./app/Kasse";
import { Kurv } from "./app/Kurv";
import { Kvittering } from "./app/Kvittering";
import { Rorside } from "./app/Rorside";
import { Skanner } from "./app/Skanner";
import { AVLOPSROR, BEND, KUNDE } from "./data";
import { Tastatur } from "./felles/Tastatur";
import { Telefon } from "./felles/Telefon";
import { Delehylle } from "./tegning/Delehylle";
import { Rorhylle } from "./tegning/Rorhylle";
import { FPS } from "./tid";
import { Hovedfilm, Kortfilm } from "./versjoner/Hovedfilm";
import { Miniatyr } from "./versjoner/Miniatyr";
import { HOVEDFILM_PLAN, KORT_PLAN } from "./versjoner/planer";

/** Prøvebilde av tegningene. */
const Tegninger: React.FC = () => (
  <AbsoluteFill style={{ background: "#1b1d20" }}>
    <div style={{ position: "absolute", left: 40, top: 40 }}>
      <Rorhylle bredde={1100} vare={AVLOPSROR} />
    </div>
    <div style={{ position: "absolute", left: 1220, top: 40 }}>
      <Rorhylle bredde={640} vare={AVLOPSROR} tatt={0.45} utenSkygge />
    </div>
    <div style={{ position: "absolute", left: 1220, top: 500 }}>
      <Delehylle bredde={420} vare={BEND} />
    </div>
  </AbsoluteFill>
);

/** Prøvebilde av skjermene, side om side. */
const Skjermer: React.FC = () => {
  const kurv1 = { antall: 1, mengde: "12 m" };
  const mork = "#171717";
  const telefoner: React.ReactNode[] = [
    <Telefon key="1" zoom={0.78}>
      <Kamera motiv="skilt" las={1} boble={1} />
    </Telefon>,
    <Telefon key="2" zoom={0.78} statusFarge={mork}>
      <Rorside s={{ vare: AVLOPSROR, mengde: { fra: 12, til: 12, p: 1 } }} />
    </Telefon>,
    <Telefon key="3" zoom={0.78} statusFarge={mork}>
      <Forside s={{ kurv: kurv1, bekreftelse: { tekst: "12 m Avløpsrør PVC 110 mm lagt i kurven", synlig: 1 } }} />
    </Telefon>,
    <Telefon key="4" zoom={0.78} statusFarge={mork}>
      <Forside s={{ kurv: kurv1 }} />
      <Skanner apne={1} pan={1} />
    </Telefon>,
    <Telefon key="5" zoom={0.78} statusFarge={mork}>
      <Rorside s={{ vare: BEND, mengde: { fra: 4, til: 4, p: 1 }, kurv: kurv1 }} />
    </Telefon>,
    <Telefon key="6" zoom={0.78} statusFarge={mork}>
      <Kurv />
    </Telefon>,
    <Telefon key="7" zoom={0.78} statusFarge={mork} over={<Tastatur modus="bokstaver" oppe={1} aktiv="t" />}>
      <Kasse
        s={{
          ...TOMT,
          verdier: { navn: KUNDE.navn, telefon: KUNDE.telefon, epost: KUNDE.epost, prosjekt: "Byggefelt Vest, t" },
          fokus: "prosjekt",
          markor: true,
          rull: 160,
          bunn: 0,
        }}
      />
    </Telefon>,
    <Telefon key="8" zoom={0.78} statusFarge={mork}>
      <Kvittering />
    </Telefon>,
  ];
  return (
    <AbsoluteFill style={{ background: "#2a2c30", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", alignItems: "center", justifyItems: "center", padding: 20 }}>
      {telefoner}
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="Proever">
      <Composition id="Tegninger" component={Tegninger} durationInFrames={30} fps={FPS} width={1920} height={1080} />
      <Composition id="Skjermer" component={Skjermer} durationInFrames={30} fps={FPS} width={1920} height={1640} />
    </Folder>
    <Folder name="Film">
      {/* Tegnet i 1920 × 1080 og rendret med --scale=2 til 4K */}
      <Composition id="Hovedfilm" component={Hovedfilm} durationInFrames={HOVEDFILM_PLAN.lengde} fps={FPS} width={1920} height={1080} />
      <Composition id="Reels-9x16" component={Kortfilm} durationInFrames={KORT_PLAN.lengde} fps={FPS} width={1080} height={1920} />
      <Composition id="Feed-4x5" component={Kortfilm} durationInFrames={KORT_PLAN.lengde} fps={FPS} width={1080} height={1350} />
      <Composition id="Miniatyr" component={Miniatyr} durationInFrames={1} fps={FPS} width={1920} height={1080} />
    </Folder>
  </>
);
