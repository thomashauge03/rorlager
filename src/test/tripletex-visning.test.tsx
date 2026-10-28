// Kva Tripletex-linja under eit grunnlag viser, og kva knappane gjer. Knappane
// kjem av statusordet, aldri av teksten i siste_feil.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TripletexRad } from "@/components/admin/TripletexRad";
import type { PipeTripletexKoRow } from "@/integrations/supabase/types";
import { erInterntGrunnlag, forklarSvar, visTripletex } from "@/lib/tripletex";

const NAA = Date.parse("2026-10-28T12:00:00Z");

const rad = (over: Partial<PipeTripletexKoRow> = {}): PipeTripletexKoRow => ({
  id: "k",
  invoice_id: "i",
  grunnlag_nr: 42,
  status: "venter",
  intern: false,
  forsok: 0,
  siste_feil: null,
  tripletex_ordre_id: null,
  vedlegg_status: null,
  vedlegg_feil: null,
  vedlegg_endret: null,
  kontrollert_av: null,
  kontrollert_at: null,
  bestilling_ider: null,
  opprettet: "2026-10-28T11:00:00Z",
  endret: "2026-10-28T11:59:00Z",
  ...over,
});

describe("visTripletex", () => {
  it("berre venter, feilet og mangler_kunde kan sendast", () => {
    const kan = (["venter", "feilet", "mangler_kunde", "under_sending", "sendt", "ukjent_utfall", "kontrollert", "sletta_grunnlag"] as const).filter(
      (s) => visTripletex(rad({ status: s }), NAA).kanSende,
    );
    expect(kan).toEqual(["venter", "feilet", "mangler_kunde"]);
  });

  it("ein feilmelding som seier «ingenting er opprettet», gjer ikkje ukjent_utfall sendbar", () => {
    const v = visTripletex(rad({ status: "ukjent_utfall", siste_feil: "Ingenting er opprettet. Prøv igjen." }), NAA);
    expect([v.kanSende, v.maKontrollere, v.harOrdre]).toEqual([false, true, true]);
  });

  it("eit kall som har stått i over fem minutt, må kontrollerast", () => {
    expect(visTripletex(rad({ status: "under_sending", endret: "2026-10-28T11:58:00Z" }), NAA).maKontrollere).toBe(false);
    expect(visTripletex(rad({ status: "under_sending", endret: "2026-10-28T11:50:00Z" }), NAA).maKontrollere).toBe(true);
  });

  it("vedlegget: lagt ved blir aldri tilbode igjen, ukjent spør først", () => {
    const sendt = { status: "sendt" as const, tripletex_ordre_id: 777 };
    expect(visTripletex(rad({ ...sendt, vedlegg_status: "lagt_ved" }), NAA).vedlegg?.knapp).toBeNull();
    expect(visTripletex(rad({ ...sendt, vedlegg_status: "feilet" }), NAA).vedlegg?.knapp).toBe("legg_ved");
    expect(visTripletex(rad({ ...sendt, vedlegg_status: "ukjent" }), NAA).vedlegg?.knapp).toBe("legg_ved_likevel");
    expect(visTripletex(rad({ ...sendt, vedlegg_status: null }), NAA).vedlegg?.knapp).toBe("legg_ved");
    // Kontrollert utan id: appen veit ikkje kva ordre det er
    expect(visTripletex(rad({ status: "kontrollert" }), NAA).vedlegg?.knapp).toBeNull();
  });
});

describe("forklarSvar", () => {
  it("seier ingenting når Tripletex er av eller grunnlaget er eldre enn bryteren", () => {
    expect(forklarSvar({ sendt: false, grunn: "av" })).toBeNull();
    expect(forklarSvar({ sendt: false, grunn: "ikke i koen" })).toBeNull();
  });

  it("ein ordre utan vedlegg er ikkje ein suksess", () => {
    expect(forklarSvar({ sendt: true, ordreId: 1, vedlegg: { status: "lagt_ved" } })?.feil).toBe(false);
    expect(forklarSvar({ sendt: true, ordreId: 1, vedlegg: { status: "ukjent", melding: "x" } })?.feil).toBe(true);
  });
});

describe("erInterntGrunnlag", () => {
  it("berre når alle uttaka er tilsette sine", () => {
    const tilsett = { kind: "uttak", created_by: "u" } as const;
    const kunde = { kind: "uttak", created_by: null } as const;
    expect(erInterntGrunnlag([tilsett, tilsett])).toBe(true);
    expect(erInterntGrunnlag([tilsett, kunde])).toBe(false);
    expect(erInterntGrunnlag([])).toBe(false);
  });
});

describe("TripletexRad", () => {
  const vis = (ko: PipeTripletexKoRow) => {
    const fn = { onSend: vi.fn(), onLeggVed: vi.fn(), onKontrollert: vi.fn() };
    render(<TripletexRad ko={ko} grunnlagNr={42} opptatt={false} {...fn} />);
    return fn;
  };

  it("mangler kunde: kundenummeret går med når ein sender", () => {
    const fn = vis(rad({ status: "mangler_kunde", siste_feil: "Fant ingen aktiv kunde med org.nr. 987654321" }));
    expect(screen.getByText(/org\.nr\. 987654321/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Kundenummer i Tripletex/), { target: { value: "10042" } });
    fireEvent.click(screen.getByRole("button", { name: /Send til Tripletex/ }));
    expect(fn.onSend).toHaveBeenCalledWith({ kundenr: 10042 });
  });

  it("internt spør først, og sender så med intern", () => {
    const fn = vis(rad());
    fireEvent.click(screen.getByRole("button", { name: /Internt – felleskonto/ }));
    expect(fn.onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send som internt" }));
    expect(fn.onSend).toHaveBeenCalledWith({ intern: true });
  });

  it("ukjent utfall har ingen Send-knapp, berre kontrollen", () => {
    const fn = vis(rad({ status: "ukjent_utfall" }));
    expect(screen.queryByRole("button", { name: /Send til Tripletex/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ordren finnes" }));
    expect(fn.onKontrollert).toHaveBeenCalledWith(true);
  });

  it("sendt med PDF-en lagt ved: ingen knappar", () => {
    vis(rad({ status: "sendt", tripletex_ordre_id: 777, vedlegg_status: "lagt_ved" }));
    expect(screen.getByText("Ordre i Tripletex")).toBeInTheDocument();
    expect(screen.getByText("PDF-en er lagt ved")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
