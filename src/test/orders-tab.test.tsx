// Fana «Bestillinger»: ei bestilling kan berre slettast når ho er avvist, og ho
// viser summen med og utan mva. Uttaka er som før.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fetchOrders, venter } = vi.hoisted(() => ({
  fetchOrders: vi.fn(),
  venter: { data: [] as unknown[] },
}));

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchOrders,
  fetchPipeTypes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/pickup-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pickup-orders")>()),
  useWaitingPickupOrders: () => venter,
  fetchOrderEmails: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ data: { vat_rate: 25, company_name: "Hauge Maskin AS" } }),
  useOrderSettings: () => ({ data: { payment_terms_days: 14 } }),
}));

import { OrdersTab } from "@/components/admin/OrdersTab";
import type { OrderWithLines } from "@/lib/types";

const ordre = (over: Partial<OrderWithLines> = {}) =>
  ({
    id: "o1",
    order_number: 1042,
    created_at: new Date().toISOString(),
    kind: "bestilling",
    status: "ny",
    stock_drawn_at: null,
    handled_at: null,
    customer_type: "privat",
    customer_name: "Ola Privat",
    customer_email: "ola@privat.no",
    customer_phone: null,
    company: null,
    org_number: null,
    billing_address: "Bakkevegen 3, 5700 Voss",
    pickup_date: "2026-10-01",
    pickup_now: false,
    customer_message: null,
    project: null,
    comment: null,
    signature: null,
    admin_note: null,
    invoice_id: null,
    total: 1350,
    lines: [],
    ...over,
  }) as unknown as OrderWithLines;

/** Viser fana med éi rad og opnar ho i sidepanelet. */
const opne = async (o: OrderWithLines) => {
  fetchOrders.mockResolvedValue([o]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrdersTab />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText(o.customer_name));
  return within(await screen.findByRole("dialog"));
};

beforeEach(() => {
  vi.clearAllMocks();
  venter.data = [];
});

describe("uttak frå tilsette", () => {
  // Ein tilsett som var logga inn, tok ut til ein jobb. Uttaket står på brukaren hans.
  const ansattUttak = (over: Partial<OrderWithLines> = {}) =>
    ordre({
      kind: "uttak",
      stock_drawn_at: new Date().toISOString(),
      customer_type: null,
      customer_name: "Leif Lager",
      customer_email: "lager@hauge.no",
      billing_address: null,
      pickup_date: null,
      project: "Byggefelt Vest, tomt 4",
      created_by: "55555555-5555-5555-5555-555555555555",
      ...over,
    });

  const vis = (o: OrderWithLines) => {
    fetchOrders.mockResolvedValue([o]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrdersTab />
      </QueryClientProvider>,
    );
  };

  it("er merkt «Ansatt» i lista, og panelet seier kven som tok ut og til kva jobb", async () => {
    vis(ansattUttak());
    expect(await screen.findByText("Ansatt")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Leif Lager"));
    const panel = within(await screen.findByRole("dialog"));
    expect(panel.getByText("Tatt ut av")).toBeInTheDocument();
    expect(panel.getByText("Byggefelt Vest, tomt 4")).toBeInTheDocument();
  });

  it("eit uttak frå ein kunde er ikkje merkt", async () => {
    vis(ansattUttak({ customer_name: "Ola Kunde", created_by: null }));
    await screen.findByText("Ola Kunde");
    expect(screen.queryByText("Ansatt")).toBeNull();
  });
});

describe("sletting", () => {
  it("ei bestilling som ikkje er avvist, kan ikkje slettast – kontoret får vite kvifor", async () => {
    const panel = await opne(ordre({ status: "behandlet", stock_drawn_at: new Date().toISOString() }));
    expect(panel.queryByRole("button", { name: "Slett" })).toBeNull();
    expect(panel.getByText("En bestilling slettes ikke før den er avvist – avvis den, så får kunden beskjed.")).toBeInTheDocument();
  });

  it("ei avvist bestilling kan slettast", async () => {
    const panel = await opne(ordre({ status: "avvist" }));
    expect(panel.getByRole("button", { name: "Slett" })).toBeInTheDocument();
  });

  it("eit uttak kan slettast som før", async () => {
    const panel = await opne(ordre({ kind: "uttak", status: "ny", customer_type: null, stock_drawn_at: new Date().toISOString() }));
    expect(panel.getByRole("button", { name: "Slett" })).toBeInTheDocument();
  });
});

describe("summen i sidepanelet", () => {
  it("viser eks. mva, mva og inkl. mva for ei bestilling", async () => {
    const panel = await opne(ordre());
    expect(panel.getByText("Sum eks. mva").nextSibling?.textContent).toMatch(/^1\s350,00 kr$/);
    expect(panel.getByText("Mva 25 %").nextSibling?.textContent).toMatch(/^337,50 kr$/);
    expect(panel.getByText("Sum inkl. mva").nextSibling?.textContent).toMatch(/^1\s687,50 kr$/);
  });

  it("viser berre eks. mva for eit uttak", async () => {
    const panel = await opne(ordre({ kind: "uttak", customer_type: null, stock_drawn_at: new Date().toISOString() }));
    expect(panel.getByText("Sum eks. mva")).toBeInTheDocument();
    expect(panel.queryByText("Sum inkl. mva")).toBeNull();
  });
});

describe("stripa «Venter på godkjenning»", () => {
  it("viser summen både eks. og inkl. mva", async () => {
    venter.data = [ordre({ id: "v1", order_number: 1043, lines: [] })];
    fetchOrders.mockResolvedValue([]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrdersTab />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/1\s350,00 kr eks\. · 1\s687,50 kr inkl\. mva · sendt/)).toBeInTheDocument();
  });
});
