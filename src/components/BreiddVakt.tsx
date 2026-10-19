import { useEffect, useState } from "react";

/*
 * MELLOMBELS FEILSØKING – skal fjernast att.
 *
 * På Lager-fana i mobilappen er sida om lag 1,5 gong breiare enn skjermen,
 * men ikkje i ein vanleg nettlesar, så det kan ikkje finnast her. Når sida er
 * breiare enn skjermen, viser denne boksen kva som stikk ut: element, tekst
 * som renn ut av boksen sin, ::before/::after, og html/body sjølve.
 */

const start = performance.now();
// Største breidda sett, og når – også om ho var der berre ei stund under lastinga
let størst = { sw: 0, ms: 0, kva: "" };

function beskriv(e: Element): string {
  const id = e.id ? `#${e.id}` : "";
  const cls = typeof e.className === "string" && e.className ? `.${e.className.trim().split(/\s+/).slice(0, 4).join(".")}` : "";
  return `${e.tagName.toLowerCase()}${id}${cls}`.slice(0, 60);
}

/** Ligg elementet inne i noko som klipper eller rullar sidelengs? Då kan det ikkje gjere sida breiare. */
function klipt(e: Element): boolean {
  for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
    // #root klipper alt no – det er nettopp det som ikkje held på telefonen
    if (p.id === "root") continue;
    const o = getComputedStyle(p).overflowX;
    if (o !== "visible") return true;
    if (getComputedStyle(p).position === "fixed") return true;
  }
  return false;
}

function mål() {
  const doc = document.documentElement;
  const cw = doc.clientWidth;
  const sw = doc.scrollWidth;
  const skala = window.visualViewport?.scale ?? 1;
  const toppar: string[] = [];
  for (const e of [doc, document.body]) {
    const r = e.getBoundingClientRect();
    if (r.right > cw + 1 || r.left < -1) toppar.push(`${e.tagName.toLowerCase()} ${Math.round(r.left)}→${Math.round(r.right)}`);
  }
  const treff: { el: Element; tekst: string }[] = [];
  const funnPush = (el: Element, tekst: string) => treff.push({ el, tekst });

  for (const e of document.body.querySelectorAll("*")) {
    if (e.closest("[data-breiddvakt]")) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const kanStikkeUt =
      r.right > cw + 1 || (e instanceof HTMLElement && r.left + e.scrollWidth > cw + 1);
    const st = getComputedStyle(e);
    if (st.position === "fixed") continue;
    if (kanStikkeUt && klipt(e)) continue;
    // Boksen sjølv
    if (r.right > cw + 1) funnPush(e, `BOKS ${beskriv(e)} [${st.position}] ${Math.round(r.left)}→${Math.round(r.right)}`);
    // Innhald (tekst) som renn ut av boksen
    else if (st.overflowX === "visible" && e instanceof HTMLElement && e.scrollWidth > e.clientWidth + 1) {
      const innhaldH = r.left + e.scrollWidth;
      if (innhaldH > cw + 1) funnPush(e, `TEKST ${beskriv(e)} boks→${Math.round(r.right)} innhald→${Math.round(innhaldH)}`);
    }
    // ::before / ::after
    for (const ps of ["::before", "::after"] as const) {
      const s = getComputedStyle(e, ps);
      if (s.content === "none" || s.content === "normal") continue;
      const b = parseFloat(s.width);
      if ((s.position === "absolute" || s.position === "relative") && b > cw * 0.5) {
        funnPush(e, `${ps} ${beskriv(e)} [${s.position}] breidd ${Math.round(b)} left ${s.left} right ${s.right}`);
      }
    }
  }

  // Dei inste først: eit element som held eit anna treff inne i seg, er berre
  // ein forelder som blir dytta ut, ikkje sjølve synderen
  const inst = (t: { el: Element }) => !treff.some((o) => o.el !== t.el && t.el.contains(o.el));
  const funn = [...toppar, ...treff.filter(inst).map((t) => t.tekst), ...treff.filter((t) => !inst(t)).map((t) => t.tekst)];

  if (sw > størst.sw) størst = { sw, ms: Math.round(performance.now() - start), kva: funn.slice(0, 3).join(" | ") };
  const forBrei = sw > cw + 1 || window.innerWidth > cw + 1 || størst.sw > cw + 1;
  if (!forBrei) return null;
  return { sw, cw, iw: window.innerWidth, skala, funn: funn.slice(0, 8), størst };
}

export function BreiddVakt() {
  const [res, setRes] = useState<ReturnType<typeof mål>>(null);
  const [lukka, setLukka] = useState(false);

  useEffect(() => {
    const sjekk = () => setRes(mål());
    // Tett i starten: er sida for brei berre medan ho lastar, skal vi sjå det
    const t = [50, 150, 300, 600, 1000, 2000, 5000].map((ms) => window.setTimeout(sjekk, ms));
    const iv = window.setInterval(sjekk, 5000);
    window.addEventListener("resize", sjekk);
    return () => {
      t.forEach(clearTimeout);
      clearInterval(iv);
      window.removeEventListener("resize", sjekk);
    };
  }, []);

  if (!res || lukka) return null;
  return (
    <div
      data-breiddvakt
      style={{ position: "fixed", left: 4, top: 4, zIndex: 2147483647, maxWidth: 360, background: "#ffe600", color: "#000", font: "11px/1.35 monospace", padding: 6, borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
      onClick={() => setLukka(true)}
    >
      {`FOR BREI: scroll ${res.sw} / skjerm ${res.cw} / vindauge ${res.iw} / zoom ${res.skala.toFixed(2)}\n`}
      {`størst ${res.størst.sw} etter ${res.størst.ms} ms: ${res.størst.kva || "–"}\n`}
      {res.funn.length ? res.funn.join("\n") : "ingen element no"}
      {"\n(trykk for å lukke)"}
    </div>
  );
}
