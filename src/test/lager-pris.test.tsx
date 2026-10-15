// Lager-fana: kor mange varer manglar salspris, og vis berre dei.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { vare } = vi.hoisted(() => ({
  vare: (id: string, name: string, price: number | null, active = true) => ({
    id, name, dimension: null, sku: id, ean: null, qr_slug: id, unit: "stk", price, cost_price: null, stock: 4,
    low_stock_threshold: 0, location: null, color: null, description: null, active, sort_order: 0,
    category_id: null, category_name: null, created_at: "", updated_at: "",
  }),
}));

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchPipeTypes: vi.fn().mockResolvedValue([
    vare("a", "Albue messing 2\" R", null),
    vare("b", "Bend grunnavløp 15°", 35.13),
    vare("c", "Plugg messing 2\" R", null),
    // Inaktiv: tel ikkje med før «Vis inaktive» er på
    vare("d", "Gammel vare", null, false),
  ]),
  fetchCategories: vi.fn().mockResolvedValue([]),
}));

import { StockTab } from "@/components/admin/StockTab";

const vis = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StockTab />
    </QueryClientProvider>,
  );

describe("varer uten pris", () => {
  it("tel dei aktive varene utan salspris", async () => {
    vis();
    expect(await screen.findByText(/2 varer mangler salgspris/)).toBeInTheDocument();
    const stat = screen.getByText("Uten pris").closest(".hm-stat") as HTMLElement;
    expect(within(stat).getByText("2")).toBeInTheDocument();
  });

  it("«Vis bare disse» viser berre varene utan pris, og kan slåast av att", async () => {
    vis();
    await screen.findByText(/2 varer mangler salgspris/);
    expect(screen.getAllByText("Bend grunnavløp 15°").length).toBeGreaterThan(0);

    const melding = screen.getByText(/mangler salgspris/).parentElement as HTMLElement;
    fireEvent.click(within(melding).getByRole("button", { name: "Vis bare disse" }));
    expect(screen.queryByText("Bend grunnavløp 15°")).not.toBeInTheDocument();
    expect(screen.getAllByText('Albue messing 2" R').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Plugg messing 2" R').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Fjern prisfilter" }));
    expect(screen.getAllByText("Bend grunnavløp 15°").length).toBeGreaterThan(0);
  });
});
