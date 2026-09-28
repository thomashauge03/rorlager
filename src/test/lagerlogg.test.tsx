// Lagerloggen viser kven som gjorde endringa. Basen har alltid lagra brukaren,
// men berre som ein uuid ingen kunne lese – no står namnet der.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchPipeTypes: vi.fn().mockResolvedValue([]),
  fetchCategories: vi.fn().mockResolvedValue([]),
  fetchStockLog: vi.fn().mockResolvedValue([
    {
      id: "l1",
      created_at: "2026-09-28T10:00:00Z",
      pipe_type_id: "t1",
      pipe_name: "Avløpsrør PVC",
      change: 3,
      balance_after: 43,
      reason: "justering",
      order_id: null,
      note: "Telt opp",
      created_by: "55555555-5555-5555-5555-555555555555",
      created_by_name: "Leif Lager",
    },
    {
      id: "l2",
      created_at: "2026-09-28T09:00:00Z",
      pipe_type_id: "t1",
      pipe_name: "Avløpsrør PVC",
      change: -5,
      balance_after: 40,
      reason: "bestilling",
      order_id: "o1",
      note: "Bestilling #1",
      created_by: null,
      created_by_name: null,
    },
  ]),
}));

import { StockTab } from "@/components/admin/StockTab";

describe("lagerloggen", () => {
  it("viser kven som gjorde endringa, og ingenting for ein kunde utan innlogging", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StockTab />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lagerlogg/ }));
    const logg = within(await screen.findByRole("dialog"));

    expect(await logg.findByText(/av Leif Lager/)).toBeInTheDocument();
    expect(logg.getAllByText(/^av /)).toHaveLength(1);
  });
});
