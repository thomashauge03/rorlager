// «Annet» slik folk møter det: knappen i tomt søk, hentekøen som ventar på pris,
// og forslagsfana til kontoret.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { fetchSuggestions, closeSuggestion } = vi.hoisted(() => ({
  fetchSuggestions: vi.fn(),
  closeSuggestion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchCatalog: vi.fn().mockResolvedValue([]),
  fetchCategories: vi.fn().mockResolvedValue([]),
  fetchPipeTypes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/pickup-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pickup-orders")>()),
  fetchOrderEmails: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/suggestions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/suggestions")>()),
  fetchSuggestions,
  closeSuggestion,
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ data: { vat_rate: 25, company_name: "Hauge Maskin AS", show_prices: true } }),
  useOrderSettings: () => ({ data: { accept_orders: false, payment_terms_days: 14 } }),
}));

import Index from "@/pages/Index";
import { PickupDetails } from "@/components/admin/PickupQueue";
import { SuggestionsTab } from "@/components/admin/SuggestionsTab";
import { clearCart, readCart } from "@/lib/cart";
import type { OrderWithLines } from "@/lib/types";
import type { Suggestion } from "@/lib/suggestions";

const medKlient = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  clearCart();
});

describe("framsida", () => {
  it("i et tomt søk blir søketeksten forslaget, og annet havner i kurven", async () => {
    medKlient(<Index />);
    fireEvent.change(screen.getByLabelText("Søk etter rør"), { target: { value: "PE-rør 40" } });
    fireEvent.click(await screen.findByRole("button", { name: /Legg til annet/ }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByLabelText("Hva er det?")).toHaveValue("PE-rør 40");

    // Uten mengde sier skjemaet fra, og ingenting legges i kurven
    fireEvent.click(dialog.getByRole("button", { name: "Legg i kurven" }));
    expect(dialog.getByRole("alert")).toHaveTextContent("Skriv hvor mye");
    expect(readCart()).toHaveLength(0);

    fireEvent.click(dialog.getByRole("radio", { name: "Stykk" }));
    fireEvent.change(dialog.getByRole("textbox", { name: /Hvor mye/ }), { target: { value: "3" } });
    fireEvent.click(dialog.getByRole("button", { name: "Legg i kurven" }));

    const [linje] = readCart();
    expect(linje).toMatchObject({ name: "PE-rør 40", unit: "stk", quantity: 3, price: null });
    expect(linje.annet).toBeTruthy();
  });
});

describe("hentekøen", () => {
  const bestilling = (unit_price: number | null) =>
    ({
      id: "o1",
      order_number: 1042,
      created_at: new Date().toISOString(),
      kind: "bestilling",
      status: "ny",
      customer_type: "privat",
      customer_name: "Ola",
      billing_address: "Vegen 1",
      pickup_date: "2026-10-20",
      pickup_now: false,
      total: 200,
      lines: [
        {
          id: "l1",
          order_id: "o1",
          pipe_type_id: null,
          is_annet: true,
          name: "Kum 400",
          dimension: null,
          sku: null,
          unit: "stk",
          quantity: 1,
          unit_price,
          line_total: unit_price,
          sort_order: 1,
        },
      ],
    }) as unknown as OrderWithLines;

  it("godkjenning er sperret til annet-linja har pris, og sier hvorfor", async () => {
    medKlient(<PickupDetails order={bestilling(null)} />);
    expect(screen.getByText("Sett pris på 1 annet-linje først.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Godkjenn" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sett pris" })).toBeEnabled();
  });

  it("med pris kan den godkjennes", () => {
    medKlient(<PickupDetails order={bestilling(1250)} />);
    expect(screen.getByRole("button", { name: "Godkjenn" })).toBeEnabled();
    expect(screen.queryByText(/annet-linje først/)).not.toBeInTheDocument();
  });
});

describe("forslagsfanen", () => {
  const forslag = (over: Partial<Suggestion> = {}): Suggestion => ({
    id: "f1",
    created_at: new Date().toISOString(),
    order_id: "o1",
    order_line_id: "l1",
    name: "PE-rør",
    dimension: "40 mm",
    unit: "m",
    quantity: 12.5,
    note: "Lå bak kummene",
    from_employee: false,
    submitted_by: "Ola Kunde",
    status: "ny",
    pipe_type_id: null,
    handled_at: null,
    handled_by: null,
    order: { order_number: 1042, kind: "uttak", invoice_id: null, status: "ny" },
    line: { unit_price: null, line_total: null },
    ...over,
  });

  it("viser hva som ble skrevet, hvem og hvor det kom fra", async () => {
    fetchSuggestions.mockResolvedValue([forslag(), forslag({ id: "f2", status: "avvist" })]);
    medKlient(<SuggestionsTab />);

    expect(await screen.findByText("PE-rør 40 mm")).toBeInTheDocument();
    expect(screen.getByText("Lå bak kummene")).toBeInTheDocument();
    expect(screen.getByText("Kunde")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Uttak #1042" })).toHaveAttribute("href", "/admin?fane=bestillinger&ordre=1042");
    expect(screen.getByRole("tab", { name: "Nye (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Behandlet (1)" })).toBeInTheDocument();
  });

  it("avvis lukker forslaget", async () => {
    fetchSuggestions.mockResolvedValue([forslag()]);
    medKlient(<SuggestionsTab />);
    fireEvent.click(await screen.findByRole("button", { name: "Avvis" }));
    await vi.waitFor(() => expect(closeSuggestion).toHaveBeenCalledWith("f1", "avvist"));
  });

  it("en fakturert ordre kan ikke få pris herfra", async () => {
    fetchSuggestions.mockResolvedValue([
      forslag({ order: { order_number: 1042, kind: "uttak", invoice_id: "i1", status: "levert" } }),
    ]);
    medKlient(<SuggestionsTab />);
    expect(await screen.findByRole("button", { name: "Sett pris" })).toBeDisabled();
    expect(screen.getByText("Mangler (fakturert)")).toBeInTheDocument();
  });
});
