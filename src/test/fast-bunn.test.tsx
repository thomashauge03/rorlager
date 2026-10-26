import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FastBunn } from "@/components/FastBunn";

// Knappen og summen står festa nedst på telefonen. Medan tastaturet er oppe,
// skal dei vike, elles dekkjer dei feltet kunden skriv i.

const ekteMatchMedia = window.matchMedia;

/** Skjermen er ein berøringsskjerm (true) eller mus og tastatur (false). */
const peikar = (grov: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: grov && q === "(pointer: coarse)",
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

afterEach(() => {
  window.matchMedia = ekteMatchMedia;
});

const Side = () => (
  <>
    <label htmlFor="navn">Navn</label>
    <input id="navn" />
    <FastBunn>
      <span>1 194,45 kr</span>
      <button type="button">Bestill</button>
    </FastBunn>
  </>
);

const bunnen = () => screen.getByText("1 194,45 kr").closest("[data-fast-bunn]");

describe("den faste bunnen", () => {
  it("viser summen og knappen", () => {
    peikar(true);
    render(<Side />);
    expect(bunnen()).not.toBeNull();
    expect(screen.getByRole("button", { name: "Bestill" })).toBeInTheDocument();
  });

  it("vik for tastaturet på ein berøringsskjerm, og kjem att etterpå", async () => {
    peikar(true);
    render(<Side />);
    const navn = screen.getByLabelText("Navn");

    act(() => navn.focus());
    expect(bunnen()).toHaveAttribute("data-skjult");

    act(() => navn.blur());
    await waitFor(() => expect(bunnen()).not.toHaveAttribute("data-skjult"));
  });

  describe("når nettlesaren fortel kor mykje av skjermen som er synleg", () => {
    /** Den synlege delen av sida – han krympar når tastaturet kjem opp. */
    const synleg = Object.assign(new EventTarget(), { height: 800, scale: 1 });
    const tastatur = (ope: boolean) =>
      act(() => {
        synleg.height = ope ? 450 : 800;
        synleg.dispatchEvent(new Event("resize"));
      });

    afterEach(() => {
      synleg.height = 800;
      delete (window as { visualViewport?: unknown }).visualViewport;
    });

    it("kjem att når tastaturet blir lukka, sjølv om feltet framleis har fokus", () => {
      Object.defineProperty(window, "visualViewport", { value: synleg, configurable: true });
      peikar(true);
      render(<Side />);
      act(() => screen.getByLabelText("Navn").focus());
      tastatur(true);
      expect(bunnen()).toHaveAttribute("data-skjult");

      // Tilbake-knappen på Android lukkar tastaturet, men feltet held på fokuset
      tastatur(false);
      expect(screen.getByLabelText("Navn")).toHaveFocus();
      expect(bunnen()).not.toHaveAttribute("data-skjult");
    });

    it("vik ikkje for eit felt som ikkje opnar noko tastatur", () => {
      Object.defineProperty(window, "visualViewport", { value: synleg, configurable: true });
      peikar(true);
      render(<Side />);
      act(() => screen.getByLabelText("Navn").focus());
      expect(bunnen()).not.toHaveAttribute("data-skjult");
    });
  });

  it("blir ståande med mus og tastatur", () => {
    peikar(false);
    render(<Side />);
    act(() => screen.getByLabelText("Navn").focus());
    expect(bunnen()).not.toHaveAttribute("data-skjult");
  });
});
