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
 * i. Enter på tastaturet går til neste felt (useNesteFelt), så knappen trengst
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

/** Sant medan eit tekstfelt har fokus på ein berøringsskjerm – då er tastaturet oppe. */
function useTastaturOpe(): boolean {
  const [ope, setOpe] = useState(false);
  useEffect(() => {
    // Med mus og tastatur finst det ikkje noko skjermtastatur å vike for.
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const sjekk = () => setOpe(erTekstfelt(document.activeElement));
    // Midt i focusout har det nye feltet ikkje fått fokus enno
    const etterpå = () => window.setTimeout(sjekk, 0);
    document.addEventListener("focusin", sjekk);
    document.addEventListener("focusout", etterpå);
    return () => {
      document.removeEventListener("focusin", sjekk);
      document.removeEventListener("focusout", etterpå);
    };
  }, []);
  return ope;
}
