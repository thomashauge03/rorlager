import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchOrders: async () => [
    {
      id: "o1",
      order_number: 12,
      created_at: "2026-10-14T08:30:00Z",
      customer_name: "Ola Ansatt",
      project: "9000123 · Storgata 4",
      project_id: "p1",
      kind: "uttak",
      lines: [
        { id: "l1", name: "PVC", dimension: "110 mm", sku: "2251059", unit: "m", quantity: 10, unit_price: 100, line_total: 1000, unit_cost: 60 },
      ],
    },
  ],
}));

import { ForbrukPanel } from "@/components/admin/ForbrukPanel";

describe("forbrukspanelet", () => {
  it("viser uttaket, kost og sal for prosjektet", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ForbrukPanel
          project={{ id: "p1", project_number: 9000123, name: "Storgata 4" } as never}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Uttak #12")).toBeInTheDocument();
    expect(screen.getByText("600,00 kr")).toBeInTheDocument();
    expect(screen.getByText("1 000,00 kr")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Last ned CSV/ })).toBeInTheDocument();
  });
});
