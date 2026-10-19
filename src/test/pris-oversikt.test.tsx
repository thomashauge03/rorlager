import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const vare = (id: string, name: string, cost_price: number | null, price: number | null, stock = 0) => ({
  id,
  name,
  dimension: "110 mm",
  sku: null,
  unit: "m",
  stock,
  cost_price,
  price,
  active: true,
  category_id: null,
});

vi.mock("@/lib/orders", async (orig) => ({
  ...(await orig<typeof import("@/lib/orders")>()),
  fetchPipeTypes: async () => [
    vare("a", "PVC", 100, 125, 10),
    vare("b", "PE", 100, 150, 2),
    vare("c", "Kobber", null, 80),
    vare("d", "Bend", 40, null),
  ],
  fetchCategories: async () => [],
}));

import { PrisOversikt } from "@/components/admin/PrisOversikt";

describe("prisoversikta", () => {
  it("viser regnestykket, tala og kva varer som avvik", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PrisOversikt paaslagProsent={25} mvaSats={25} />
      </QueryClientProvider>,
    );

    // 100 kr inn + 25 % = 125 eks. mva, 156,25 inkl. mva, 20 % dekningsgrad
    expect(screen.getByText("Gir 20 % dekningsgrad")).toBeInTheDocument();
    expect(screen.getByText("156,25")).toBeInTheDocument();

    expect(await screen.findByText("1 av 4")).toBeInTheDocument();
    const pe = screen.getByText("PE 110 mm").closest("tr")!;
    expect(within(pe).getByText("Avviker")).toBeInTheDocument();
    expect(within(pe).getByText("50 %")).toBeInTheDocument();
    expect(within(pe).getByText("+50,00")).toBeInTheDocument();
    expect(within(pe).getByText("Standard gir 125,00")).toBeInTheDocument();

    // Trykk på ruta filtrerer tabellen til dei som manglar innkjøpspris
    fireEvent.click(screen.getByRole("button", { name: /Mangler innkjøpspris/ }));
    expect(screen.getByText("Kobber 110 mm")).toBeInTheDocument();
    expect(screen.queryByText("PVC 110 mm")).toBeNull();
  });
});
