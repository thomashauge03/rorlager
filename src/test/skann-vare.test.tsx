// «Skann vare» i Lager-fana: skann éin kasse, sjå beholdninga, tel og gå vidare.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpc, toast, skannar } = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
  // Kva den falske skannaren «ser», og kva onCode svarte
  skannar: { kode: "", svar: undefined as string | null | undefined },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/components/Scanner", () => ({
  Scanner: ({ open, onCode }: { open: boolean; onCode: (k: string) => string | null }) =>
    open ? (
      <button type="button" onClick={() => (skannar.svar = onCode(skannar.kode))}>
        skann
      </button>
    ) : null,
}));

import { SkannVare } from "@/components/admin/SkannVare";
import type { PipeType } from "@/lib/types";

const vare = (over: Partial<PipeType> = {}) =>
  ({
    id: "v1", name: "Nippelmuffe messing", dimension: '1"x 3/4"', unit: "stk", location: "B-3", sku: "5020362",
    qr_slug: "nippelmuffe-messing-1-x-3-4", stock: 3, low_stock_threshold: 0, active: true, ...over,
  }) as PipeType;

const skann = (kode: string) => {
  skannar.kode = kode;
  fireEvent.click(screen.getByRole("button", { name: "skann" }));
};

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 5, error: null });
  toast.mockReset();
  skannar.svar = undefined;
});

const vis = (onClose = vi.fn(), onJuster = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SkannVare varer={[vare()]} onClose={onClose} onJuster={onJuster} />
    </QueryClientProvider>,
  );
  return { onClose, onJuster };
};

describe("Skann vare", () => {
  it("viser kor mange som ligg på lager når QR-koden på hylla blir skanna", () => {
    vis();
    skann("https://rorlager.vercel.app/r/nippelmuffe-messing-1-x-3-4");
    // Skannaren gir vidare koden slik han les han; finnVare kjenner att sluggen
    skann("nippelmuffe-messing-1-x-3-4");
    expect(screen.getByText("På lager nå")).toBeInTheDocument();
    expect(screen.getByText(/Hylle B-3 · Varenr\. 5020362/)).toBeInTheDocument();
    expect(screen.getByText("Stemmer med det som er registrert.")).toBeInTheDocument();
  });

  it("finn varen på varenummeret òg", () => {
    vis();
    skann("5020362");
    expect(screen.getByText("På lager nå")).toBeInTheDocument();
  });

  it("tel opp, lagrar som opptelling og opnar kameraet att", async () => {
    const { onClose } = vis();
    skann("nippelmuffe-messing-1-x-3-4");
    fireEvent.change(screen.getByRole("textbox", { name: /Talt antall/ }), { target: { value: "5" } });
    expect(screen.getByText("+2 stk mot det som er registrert.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Lagre og skann neste/ }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("pipe_set_stock", { p_pipe_type_id: "v1", p_stock: 5, p_note: "Telt med skanner" }),
    );
    // Klar for neste kasse, utan å lukke
    await waitFor(() => expect(screen.getByRole("button", { name: "skann" })).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ein ukjend kode held kameraet ope og seier frå", () => {
    vis();
    skann("finst-ikkje");
    expect(skannar.svar).toBe("Fant ingen vare med koden finst-ikkje.");
    expect(screen.getByRole("button", { name: "skann" })).toBeInTheDocument();
  });

  it("påfyll og uttak går til den vanlege justeringa", () => {
    const { onJuster } = vis();
    skann("5020362");
    fireEvent.click(screen.getByRole("button", { name: "Legg til" }));
    expect(onJuster).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }), "add");
  });
});
