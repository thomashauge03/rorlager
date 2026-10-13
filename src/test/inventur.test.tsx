import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/components/Scanner", () => ({ Scanner: () => null }));

import { avvik, iHylleorden } from "@/lib/inventur";
import { InventurPanel } from "@/components/admin/InventurPanel";
import type { PipeType } from "@/lib/types";

const vare = (id: string, location: string | null, stock = 10, over: Partial<PipeType> = {}) =>
  ({ id, name: `Vare ${id}`, dimension: null, unit: "m", location, stock, cost_price: 50, active: true, qr_slug: id, sku: null, ...over }) as PipeType;

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset().mockResolvedValue({ data: { telde: 2, avvik: 1 }, error: null });
});

describe("hylleorden og avvik", () => {
  it("A-2 før A-10, utan hylle sist", () => {
    expect(iHylleorden([vare("x", null), vare("b", "A-10"), vare("a", "A-2"), vare("c", "B-1")]).map((v) => v.id)).toEqual([
      "a",
      "b",
      "c",
      "x",
    ]);
  });

  it("berre telde varer med avvik, største verdi først", () => {
    const r = avvik([vare("a", "A", 10), vare("b", "B", 10), vare("c", "C", 10)], { a: 10, b: 4, c: 11 });
    expect(r.map((x) => [x.vare.id, x.diff, x.verdi])).toEqual([
      ["b", -6, -300],
      ["c", 1, 50],
    ]);
  });
});

describe("inventurpanelet", () => {
  const vis = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <InventurPanel varer={[vare("a", "A-1", 10), vare("b", "A-2", 20)]} visKostpris onClose={() => {}} />
      </QueryClientProvider>,
    );

  it("tel, viser avviket, og lagrar berre det som er telt", async () => {
    vis();
    fireEvent.change(screen.getByLabelText("Vare a"), { target: { value: "8" } });
    expect(screen.getByText(/1 av 2 telt · 1 avvik/)).toBeInTheDocument();
    expect(localStorage.getItem("rorlager.inventur.v1")).toContain('"a":"8"');

    fireEvent.click(screen.getByRole("button", { name: /Se avvik og lagre/ }));
    expect(screen.getByText(/minus 100,00 kr i innkjøpsverdi/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lagre inventuren" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("pipe_inventur", { p_linjer: [{ pipe_type_id: "a", telt: 8 }], p_merknad: null }),
    );
    await waitFor(() => expect(localStorage.getItem("rorlager.inventur.v1")).toBeNull());
  });

  it("hentar fram eit utkast etter omlasting", () => {
    localStorage.setItem("rorlager.inventur.v1", JSON.stringify({ b: "20" }));
    vis();
    expect(screen.getByLabelText("Vare b")).toHaveValue("20");
    expect(screen.getByText(/1 av 2 telt · 0 avvik/)).toBeInTheDocument();
  });
});
