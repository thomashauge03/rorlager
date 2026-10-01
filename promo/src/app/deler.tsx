import React from "react";
import { dmSans } from "../fonter";
import { HmLogo } from "../merke/HmLogo";
import { app, RADIUS } from "../tema";

/*
 * Rørlagerets byggeklosser, gjengitt fra appen (src/components og
 * src/index.css i rorlager). Tailwind-klassene står i kommentarene, så det
 * er lett å se hva som svarer til hva. Skjermen er 440 punkter bred, som en
 * stor mobil, og 1 punkt er 1 CSS-piksel i appen.
 */

export const SKJERM = { b: 440, h: 917 } as const;
/** main: px-3 */
export const KANT_X = 12;
/** Innholdsbredden inne i main */
export const INNHOLD_B = SKJERM.b - 2 * KANT_X;

/* ------------------------------------------------------------------ */
/*  Ikoner (lucide-react, 24 × 24, strek 2)                            */
/* ------------------------------------------------------------------ */

const IKONER = {
  pilVenstre: <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  pilHoyre: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  kurv: <><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
  kamera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>,
  sok: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  kryss: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  pluss: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  minus: <path d="M5 12h14" />,
  hjem: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  soppel: <><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></>,
  nal: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  laster: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
  hake: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  last: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></>,
  las: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
} as const;

export type IkonNavn = keyof typeof IKONER;

export const Ikon: React.FC<{ navn: IkonNavn; storrelse?: number; farge?: string; rotasjon?: number }> = ({ navn, storrelse = 20, farge = "currentColor", rotasjon }) => (
  <svg
    width={storrelse}
    height={storrelse}
    viewBox="0 0 24 24"
    fill="none"
    stroke={farge}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "block", flexShrink: 0, transform: rotasjon ? `rotate(${rotasjon}deg)` : undefined }}
  >
    {IKONER[navn]}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Siden og topplinja                                                  */
/* ------------------------------------------------------------------ */

/**
 * .hm-page: lys bakgrunn med rød glød fra toppen og et fint rutenett på
 * 44 punkter, så flatene ikke blir helt hvite og tomme.
 */
export const Side: React.FC<{ hoyde?: number; children: React.ReactNode }> = ({ hoyde = SKJERM.h, children }) => (
  <div
    style={{
      position: "relative",
      width: SKJERM.b,
      height: hoyde,
      fontFamily: dmSans,
      color: app.blekk,
      backgroundColor: app.bakgrunn,
      backgroundImage: [
        "radial-gradient(768px 384px at 50% -128px, rgba(211,18,28,0.14), transparent 70%)",
        "linear-gradient(rgba(20,20,20,0.035) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(20,20,20,0.035) 1px, transparent 1px)",
      ].join(", "),
      backgroundSize: "100% 100%, 44px 44px, 44px 44px",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

/** Topplinja: py-2.5 rundt 44 punkter høye knapper, og border-b-4 i rødt. */
export const TOPPLINJE_H = 68;

/** Midten av handlekurvknappen i topplinja (skjermens punkter). */
export const KURVKNAPP = { x: SKJERM.b - 12 - 22, y: 32 } as const;

export const Topplinje: React.FC<{
  tittel: string;
  undertittel?: string;
  tilbake?: boolean;
  /** Vis handlekurven, med så mange varer på merket (0 = uten merke) */
  kurv?: number;
}> = ({ tittel, undertittel, tilbake = false, kurv }) => (
  // .hm-topbar: bakgrunn --brand-surface, border-b-4 border-primary
  <div style={{ height: TOPPLINJE_H, background: app.merkeflate, color: "#fff", borderBottom: `4px solid ${app.rod}`, boxSizing: "border-box" }}>
    {/* px-3 py-2.5 flex items-center gap-2 */}
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", height: 64, boxSizing: "border-box" }}>
      {tilbake && (
        <div style={{ width: 44, height: 44, marginLeft: -4, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ikon navn="pilVenstre" farge="#fff" />
        </div>
      )}
      {/* .hm-logo-badge: bg-white rounded-lg p-1.5, logoen h-7 */}
      <div style={{ background: "#fff", borderRadius: RADIUS.lg, padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 45, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HmLogo hoyde={25} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tittel}</div>
        {undertittel && <div style={{ fontSize: 12, lineHeight: "16px", color: "rgba(255,255,255,0.6)" }}>{undertittel}</div>}
      </div>
      {kurv !== undefined && (
        <div style={{ position: "relative", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ikon navn="kurv" farge="#fff" />
          {kurv > 0 && (
            // absolute top-1 right-0.5 min-w-[1.15rem] h-[1.15rem] rounded-full bg-primary text-[0.7rem] font-bold
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 2,
                minWidth: 18.4,
                height: 18.4,
                padding: "0 4px",
                boxSizing: "border-box",
                borderRadius: 999,
                background: app.rod,
                color: "#fff",
                fontSize: 11.2,
                fontWeight: 700,
                lineHeight: "18.4px",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {kurv}
            </span>
          )}
        </div>
      )}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Kort, knapper, felt                                                 */
/* ------------------------------------------------------------------ */

/** .hm-card: bg-card border rounded-lg, svak skygge */
export const Kort: React.FC<{ stil?: React.CSSProperties; children: React.ReactNode }> = ({ stil, children }) => (
  <div
    style={{
      background: app.kort,
      border: `1px solid ${app.kant}`,
      borderRadius: RADIUS.lg,
      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
      ...stil,
    }}
  >
    {children}
  </div>
);

export type KnappVariant = "primar" | "kontur" | "spokelse";

/**
 * Button fra shadcn: rounded-md, font-medium (font-semibold der appen sier
 * det), ikon og tekst med gap-2. `trykk` (0–1) gjør knappen mørkere idet
 * fingeren treffer, som hover:bg-primary/90 på en berøringsskjerm.
 */
export const Knapp: React.FC<{
  tekst: React.ReactNode;
  variant?: KnappVariant;
  hoyde: number;
  ikon?: IkonNavn;
  ikonEtter?: IkonNavn;
  ikonStr?: number;
  skrift?: number;
  fet?: boolean;
  trykk?: number;
  /** Spinneren roterer: vinkel i grader (Loader2 med animate-spin) */
  spinner?: number;
  /** 0–1: knappen er av (disabled:opacity-50), og går over til på */
  av?: number;
}> = ({ tekst, variant = "primar", hoyde, ikon, ikonEtter, ikonStr = 20, skrift = 16, fet = false, trykk = 0, spinner, av = 0 }) => {
  const stil: Record<KnappVariant, React.CSSProperties> = {
    primar: { background: trykk > 0.3 ? "#c0101a" : app.rod, color: "#fff", border: "1px solid transparent" },
    kontur: { background: trykk > 0.3 ? "#2e2e2e" : app.bakgrunn, color: trykk > 0.3 ? "#fff" : app.blekk, border: `1px solid ${app.kant}` },
    spokelse: { background: trykk > 0.3 ? "#2e2e2e" : "transparent", color: trykk > 0.3 ? "#fff" : app.blekkSvak, border: "1px solid transparent" },
  };
  return (
    <div
      style={{
        height: hoyde,
        width: "100%",
        boxSizing: "border-box",
        borderRadius: RADIUS.md,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 16px",
        fontSize: skrift,
        fontWeight: fet ? 600 : 500,
        whiteSpace: "nowrap",
        opacity: 1 - 0.5 * av,
        ...stil[variant],
      }}
    >
      {spinner !== undefined ? <Ikon navn="laster" storrelse={ikonStr} rotasjon={spinner} /> : ikon && <Ikon navn={ikon} storrelse={ikonStr} />}
      <span>{tekst}</span>
      {ikonEtter && <Ikon navn={ikonEtter} storrelse={ikonStr} />}
    </div>
  );
};

/** Label: text-sm font-medium leading-none, og rød stjerne når feltet er påkrevd */
export const Etikett: React.FC<{ tekst: string; pakrevd?: boolean }> = ({ tekst, pakrevd }) => (
  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: "14px", color: app.blekk }}>
    {tekst} {pakrevd && <span style={{ color: "#dc2828" }}>*</span>}
  </div>
);

export const FELT_H = 48;

/**
 * Input: h-12 rounded-md border border-input bg-background px-3 text-base.
 * Fokus gir ring-2 ring-ring ring-offset-2, og markøren blinker.
 */
export const Felt: React.FC<{
  verdi: string;
  plassholder?: string;
  fokus?: boolean;
  markor?: boolean;
  venstreIkon?: IkonNavn;
}> = ({ verdi, plassholder, fokus = false, markor = false, venstreIkon }) => (
  <div
    style={{
      position: "relative",
      height: FELT_H,
      boxSizing: "border-box",
      borderRadius: RADIUS.md,
      border: `1px solid ${app.kant}`,
      background: app.bakgrunn,
      padding: venstreIkon ? "0 44px" : "0 12px",
      display: "flex",
      alignItems: "center",
      fontSize: 16,
      color: verdi ? app.blekk : app.blekkSvak,
      whiteSpace: "nowrap",
      overflow: "visible",
      boxShadow: fokus ? `0 0 0 2px ${app.bakgrunn}, 0 0 0 4px ${app.ring}` : undefined,
    }}
  >
    {venstreIkon && (
      <div style={{ position: "absolute", left: 12, top: 14 }}>
        <Ikon navn={venstreIkon} farge={app.blekkSvak} />
      </div>
    )}
    <span style={{ overflow: "hidden" }}>{verdi || plassholder}</span>
    {fokus && markor && <span style={{ display: "inline-block", width: 1.5, height: 20, marginLeft: verdi ? 1 : -1, background: app.blekk, position: verdi ? "static" : "absolute", left: 12 }} />}
  </div>
);

/** Hint under et felt: text-xs text-muted-foreground */
export const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, lineHeight: "16px", color: app.blekkSvak }}>{children}</div>
);

/** .hm-chip med lagerstatus: bg-success/15 text-success border-success/30 */
export const LagerMerke: React.FC = () => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      borderRadius: RADIUS.md,
      padding: "2px 8px",
      fontSize: 12,
      lineHeight: "16px",
      fontWeight: 500,
      color: app.gronn,
      background: "rgba(41,163,122,0.15)",
      border: "1px solid rgba(41,163,122,0.3)",
      whiteSpace: "nowrap",
    }}
  >
    På lager
  </span>
);

/* ------------------------------------------------------------------ */
/*  Kurvlinja og bekreftelsen                                           */
/* ------------------------------------------------------------------ */

/** CartBar: fast nederst, border-t bg-card/95 px-3 pt-3 og knappen h-12. */
export const KURVLINJE_H = 73;

/** Midten av «Se kurven» (skjermens punkter). */
export const SE_KURVEN = { x: SKJERM.b - 12 - 66, y: SKJERM.h - 12 - 24 } as const;

export const Kurvlinje: React.FC<{ antall: number; mengde: string; trykk?: number }> = ({ antall, mengde, trykk = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: KURVLINJE_H,
      boxSizing: "border-box",
      borderTop: `1px solid ${app.kant}`,
      background: "rgba(255,255,255,0.95)",
      padding: "12px 12px 12px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontFamily: dmSans,
    }}
  >
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: "20px", color: app.blekk }}>
        {antall} {antall === 1 ? "vare" : "varer"}
      </div>
      {/* Prisene er av: mengden summert per enhet, «12 m · 4 stk» */}
      <div style={{ fontSize: 14, lineHeight: "20px", color: app.blekkSvak, fontVariantNumeric: "tabular-nums" }}>{mengde}</div>
    </div>
    <div style={{ width: 132 }}>
      <Knapp tekst="Se kurven" hoyde={48} ikon="kurv" fet trykk={trykk} />
    </div>
  </div>
);

/**
 * Sonner-toasten på mobil, målt i appen: 16 punkter til kantene og bunnen,
 * p-4, runding 8, ingen kantlinje, shadow-lg, 13 punkter tekst (tittelen
 * 500) og et ikon på 16. Den kommer nedenfra. `synlig` (0–1) for inn og ut.
 */
export const Bekreftelse: React.FC<{ tekst: string; synlig: number }> = ({ tekst, synlig }) =>
  synlig <= 0 ? null : (
    <div
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 16,
        padding: 16,
        borderRadius: 8,
        background: app.bakgrunn,
        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: dmSans,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.5,
        color: app.blekk,
        opacity: synlig,
        transform: `translateY(${(1 - synlig) * 40}px)`,
        zIndex: 60,
      }}
    >
      {/* Sonners eget suksessikon: fylt sirkel med hake */}
      <svg width="16" height="16" viewBox="0 0 20 20" fill={app.blekk} style={{ flexShrink: 0 }}>
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
      <span>{tekst}</span>
    </div>
  );
