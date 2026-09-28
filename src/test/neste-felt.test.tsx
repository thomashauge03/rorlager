import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNesteFelt } from "@/lib/neste-felt";

// Enter er den store knappen nede til høgre på mobiltastaturet. Han blir trykt
// for å kome vidare – ikkje for å sende inn skjemaet.

function Skjema({ onSubmit }: { onSubmit: () => void }) {
  const { ref, onKeyDown } = useNesteFelt();
  return (
    <form
      ref={ref}
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="a">Navn</label>
      <input id="a" />
      <label htmlFor="b">E-post</label>
      <input id="b" type="email" />
      <input type="checkbox" aria-label="Husk meg" />
      <label htmlFor="c">Kommentar</label>
      <textarea id="c" />
      <label htmlFor="d">Prosjekt</label>
      <input id="d" />
      <button type="submit">Send</button>
    </form>
  );
}

describe("Enter i skjemaet", () => {
  it("flyttar til neste felt og sender ikkje", () => {
    const send = vi.fn();
    render(<Skjema onSubmit={send} />);
    const navn = screen.getByLabelText("Navn");
    navn.focus();

    // fireEvent svarar false når hendinga blei stoppa – då sender ikkje nettlesaren skjemaet
    expect(fireEvent.keyDown(navn, { key: "Enter" })).toBe(false);
    expect(screen.getByLabelText("E-post")).toHaveFocus();
    expect(send).not.toHaveBeenCalled();
  });

  it("hoppar over avkryssingsboksar", () => {
    render(<Skjema onSubmit={() => {}} />);
    const epost = screen.getByLabelText("E-post");
    epost.focus();
    fireEvent.keyDown(epost, { key: "Enter" });
    expect(screen.getByLabelText("Kommentar")).toHaveFocus();
  });

  it("lukkar tastaturet på det siste feltet i staden for å sende", () => {
    const send = vi.fn();
    render(<Skjema onSubmit={send} />);
    const prosjekt = screen.getByLabelText("Prosjekt");
    prosjekt.focus();

    expect(fireEvent.keyDown(prosjekt, { key: "Enter" })).toBe(false);
    expect(prosjekt).not.toHaveFocus();
    expect(send).not.toHaveBeenCalled();
  });

  it("lèt Enter vere linjeskift i eit tekstområde", () => {
    render(<Skjema onSubmit={() => {}} />);
    const kommentar = screen.getByLabelText("Kommentar");
    kommentar.focus();

    expect(fireEvent.keyDown(kommentar, { key: "Enter" })).toBe(true);
    expect(kommentar).toHaveFocus();
  });

  it("viser «Neste» på tastaturet, og «Ferdig» på det siste feltet", () => {
    render(<Skjema onSubmit={() => {}} />);
    expect(screen.getByLabelText("Navn")).toHaveAttribute("enterkeyhint", "next");
    expect(screen.getByLabelText("E-post")).toHaveAttribute("enterkeyhint", "next");
    expect(screen.getByLabelText("Prosjekt")).toHaveAttribute("enterkeyhint", "done");
  });
});
