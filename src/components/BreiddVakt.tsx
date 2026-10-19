import { useEffect, useState } from "react";

/*
 * MELLOMBELS FEILSØKING – skal fjernast att.
 *
 * På Lager-fana i mobilappen er sida om lag 1,5 gong breiare enn skjermen,
 * men ikkje i ein vanleg nettlesar, så det kan ikkje finnast her. Når sida er
 * breiare enn skjermen, viser denne boksen kva element som stikk ut.
 */
type Funn = { namn: string; pos: string; v: number; h: number; b: number };

function beskriv(e: Element): string {
  const id = e.id ? `#${e.id}` : "";
  const cls = typeof e.className === "string" && e.className ? `.${e.className.trim().split(/\s+/).slice(0, 4).join(".")}` : "";
  return `${e.tagName.toLowerCase()}${id}${cls}`.slice(0, 70);
}

function mål(): { sw: number; cw: number; iw: number; funn: Funn[] } | null {
  const doc = document.documentElement;
  const cw = doc.clientWidth;
  if (doc.scrollWidth <= cw + 1 && window.innerWidth <= cw + 1) return null;
  const funn: Funn[] = [];
  for (const e of document.body.querySelectorAll("*")) {
    if (e.closest("[data-breiddvakt]")) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.right <= cw + 1) continue;
    const p = e.parentElement?.getBoundingClientRect();
    // Berre der det startar: forelderen held seg innanfor
    if (p && p.right > cw + 1 && e.parentElement !== document.body) continue;
    funn.push({ namn: beskriv(e), pos: getComputedStyle(e).position, v: Math.round(r.left), h: Math.round(r.right), b: Math.round(r.width) });
  }
  funn.sort((a, b) => b.h - a.h);
  return { sw: doc.scrollWidth, cw, iw: window.innerWidth, funn: funn.slice(0, 8) };
}

export function BreiddVakt() {
  const [res, setRes] = useState<ReturnType<typeof mål>>(null);
  const [lukka, setLukka] = useState(false);

  useEffect(() => {
    const sjekk = () => setRes(mål());
    const t = [500, 2000, 5000].map((ms) => window.setTimeout(sjekk, ms));
    const iv = window.setInterval(sjekk, 3000);
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
      {`FOR BREI: scroll ${res.sw} / skjerm ${res.cw} / vindauge ${res.iw}\n`}
      {res.funn.map((f) => `${f.namn} [${f.pos}] ${f.v}→${f.h} (${f.b})`).join("\n")}
      {"\n(trykk for å lukke)"}
    </div>
  );
}
