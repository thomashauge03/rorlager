import { useEffect, useRef, type KeyboardEvent } from "react";

/*
 * ENTER I EIT SKJEMA PÅ MOBILEN.
 *
 * Nettlesaren sender skjemaet når nokon trykkjer Enter i eit tekstfelt. På ein
 * telefon er Enter den store knappen nede til høgre på tastaturet, og han blir
 * trykt for å kome vidare – ikkje for å sende. Og ei bestilling frå ein
 * privatperson er berre bindande når ho blir send med knappen «Bestill med
 * betalingsplikt», ikkje med ein tast.
 *
 * Difor flyttar Enter til neste felt, og lukkar tastaturet på det siste.
 * Skjemaet blir berre sendt med knappen. I eit tekstområde er Enter framleis
 * linjeskift.
 */

const IKKJE_TEKST = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "hidden", "image", "range", "color"]);

type Felt = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Eit felt ein skriv eller vel noko i – ikkje avkryssingsboksar og knappar. */
export const erTekstfelt = (el: Element | null): el is Felt =>
  (el instanceof HTMLInputElement && !IKKJE_TEKST.has(el.type)) ||
  el instanceof HTMLSelectElement ||
  el instanceof HTMLTextAreaElement;

/** Felta i skjemaet, i den rekkjefølgja dei står. */
const skjemafelt = (form: HTMLFormElement): Felt[] =>
  [...form.querySelectorAll("input, select, textarea")].filter(erTekstfelt).filter((f) => !f.disabled);

export function useNesteFelt() {
  const ref = useRef<HTMLFormElement>(null);

  // Tastaturet viser «Neste» på alle felt utanom det siste, som får «Ferdig».
  // Køyrer etter kvar teikning: felt kjem og går med vala kunden gjer.
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const felt = skjemafelt(form);
    felt.forEach((f, i) => {
      if (f instanceof HTMLInputElement) f.setAttribute("enterkeyhint", i < felt.length - 1 ? "next" : "done");
    });
  });

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const felt = e.target as Element;
    if (!(felt instanceof HTMLInputElement) || !erTekstfelt(felt)) return;
    e.preventDefault();
    const alle = skjemafelt(e.currentTarget);
    const neste = alle[alle.indexOf(felt) + 1];
    if (neste) neste.focus();
    else felt.blur();
  };

  return { ref, onKeyDown };
}
