import { useEffect, useState, type ReactNode } from "react";
import { erTekstfelt } from "@/lib/neste-felt";
import { cn } from "@/lib/utils";

/*
 * SUMMEN OG KNAPPEN, FESTA NEDST PÅ TELEFONEN.
 *
 * Kassen er lang på ein telefon. Knappen skal ikkje ligge to skjermlengder
 * nede, og summen skal stå rett ved han – det er der kunden ser totalprisen
 * før han bestiller. Frå sm og oppover står dei i flyten som før.
 *
 * Medan tastaturet er oppe, vik bunnen, elles dekkjer han feltet kunden skriv
 * i. Han kjem att så snart tastaturet går ned. Enter på tastaturet går til neste felt (useNesteFelt), så knappen trengst
 * ikkje før kunden er ferdig.
 *
 * Må stå inne i <form>, så knappen sender skjemaet: plasseringa er berre CSS.
 */
export function FastBunn({ children }: { children: ReactNode }) {
  const tastatur = useTastaturOpe();
  return (
    <div
      data-fast-bunn=""
      data-skjult={tastatur || undefined}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur",
        "sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none",
        tastatur && "max-sm:hidden",
      )}
    >
      <div className="mx-auto max-w-2xl space-y-2">{children}</div>
    </div>
  );
}

/** Så mykje må den synlege delen av sida krympe før det tel som tastatur – adresselinja er mindre. */
const TASTATURHØGD = 150;

/**
 * Sant medan skjermtastaturet er oppe over eit tekstfelt.
 *
 * Fokus åleine er ikkje nok: tilbake-knappen på Android lukkar tastaturet,
 * men feltet held på fokuset, og då stod knappen borte til kunden trykte ein
 * annan stad. Difor må den synlege delen av sida (visualViewport) òg ha
 * krympa. Nettlesarar utan visualViewport fell tilbake til berre fokus.
 */
function useTastaturOpe(): boolean {
  const [ope, setOpe] = useState(false);
  useEffect(() => {
    // Med mus og tastatur finst det ikkje noko skjermtastatur å vike for.
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const synleg = window.visualViewport;
    // Høgaste synlege høgd i denne breidda – blir nullstilt når telefonen blir snudd
    let breidd = window.innerWidth;
    let full = 0;
    const sjekk = () => {
      const felt = erTekstfelt(document.activeElement);
      if (!synleg) return setOpe(felt);
      if (window.innerWidth !== breidd) {
        breidd = window.innerWidth;
        full = 0;
      }
      // Gange med scale, så det å zoome inn ikkje ser ut som eit tastatur
      const høgd = synleg.height * synleg.scale;
      full = Math.max(full, høgd, window.innerHeight);
      setOpe(felt && full - høgd > TASTATURHØGD);
    };
    // Midt i focusout har det nye feltet ikkje fått fokus enno
    const etterpå = () => window.setTimeout(sjekk, 0);
    sjekk();
    document.addEventListener("focusin", sjekk);
    document.addEventListener("focusout", etterpå);
    synleg?.addEventListener("resize", sjekk);
    return () => {
      document.removeEventListener("focusin", sjekk);
      document.removeEventListener("focusout", etterpå);
      synleg?.removeEventListener("resize", sjekk);
    };
  }, []);
  return ope;
}
