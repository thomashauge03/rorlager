import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { prishopp } = vi.hoisted(() => ({ prishopp: vi.fn().mockResolvedValue(2) }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/orders", async (orig) => ({
  ...(await orig<typeof import("@/lib/orders")>()),
  fetchPipeTypes: async () => [
    { id: "a", name: "PVC", dimension: "110 mm", cost_price: 100, price: 135, prishopp_faktor: 1, category_id: null, active: true },
    { id: "b", name: "Bend", dimension: null, cost_price: 1000, price: 1350, prishopp_faktor: 1, category_id: null, active: true },
  ],
  fetchCategories: async () => [],
}));
vi.mock("@/lib/prishopp", async (orig) => ({
  ...(await orig<typeof import("@/lib/prishopp")>()),
  prishopp,
  fetchPrisHendingar: async () => [
    {
      id: "h1",
      created_at: "2026-10-19T08:00:00Z",
      created_by: null,
      created_by_name: "Thomas",
      slag: "import",
      prosent: 35,
      grunn: null,
      category_id: null,
      kategori_namn: null,
      avrunding: 1,
      antall: 383,
    },
  ],
}));

import { Prishopp } from "@/components/admin/Prishopp";

describe("prishopp-kortet", () => {
  it("viser status, førehandsviser hoppet og sender det med grunn", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Prishopp paaslagProsent={35} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ingen hopp")).toBeInTheDocument();
    expect(await screen.findByText(/Ny prisliste fra Dahl/)).toBeInTheDocument();
    expect(screen.getByText(/prishopp nullstilt/)).toBeInTheDocument();

    const knapp = screen.getByRole("button", { name: "Legg på prishopp" });
    fireEvent.change(screen.getByLabelText("Prishopp (%)"), { target: { value: "5" } });
    expect(knapp).toBeDisabled(); // grunn manglar
    fireEvent.change(screen.getByLabelText("Grunn"), { target: { value: "Kronen svekket" } });

    // 100 × 1,35 × 1,05 = 141,75 → 142
    const pvc = (await screen.findByText("PVC 110 mm")).closest("tr")!;
    expect(within(pvc).getByText("142,00")).toBeInTheDocument();
    expect(within(pvc).getByText("+7,00")).toBeInTheDocument();

    fireEvent.click(knapp);
    const dialog = within(await screen.findByRole("alertdialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Legg på prishopp" }));
    await vi.waitFor(() =>
      expect(prishopp).toHaveBeenCalledWith(5, "Kronen svekket", { categoryId: null, roundTo: 1 }),
    );
  });
});
