import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Checkout from "@/pages/Checkout";
import PickupCheckout from "@/pages/PickupCheckout";

// Kassane skal fungere på ein telefon: det valfrie ligg bak ei lenkje, og
// summen står saman med knappen i den faste bunnen.

vi.mock("@/lib/settings", () => ({
  useSettings: () => ({
    data: {
      show_prices: true,
      require_phone: true,
      require_signature: false,
      vat_rate: 25,
      pickup_note: null,
      phone: null,
    },
  }),
  useOrderSettings: () => ({
    data: { id: 1, accept_orders: true, payment_terms_days: 14 },
    isPlaceholderData: false,
    isLoading: false,
  }),
}));

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchCatalog: async () => [
    {
      id: "t1",
      category_id: null,
      name: "Avløpsrør PVC",
      dimension: "110 mm",
      sku: "2251059",
      qr_slug: "avlopsror-pvc-110-mm",
      unit: "m",
      price: 79.63,
      stock: 40,
      low_stock_threshold: 0,
      location: null,
      color: null,
      description: null,
      active: true,
      sort_order: 0,
      created_at: "",
      updated_at: "",
    },
  ],
}));

const vis = (side: JSX.Element, sti: string) =>
  render(
    <MemoryRouter initialEntries={[sti]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {side}
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("uttakskassen", () => {
  const visUttak = () => {
    localStorage.setItem(
      "rorlager.kurv.v1",
      JSON.stringify([
        {
          pipe_type_id: "t1",
          name: "Avløpsrør PVC",
          dimension: "110 mm",
          sku: "2251059",
          unit: "m",
          price: 79.63,
          quantity: 5,
          location: null,
        },
      ]),
    );
    return vis(<Checkout />, "/kasse");
  };

  it("har e-post og kommentar bak ei lenkje", () => {
    visUttak();
    expect(screen.queryByLabelText(/E-post/)).toBeNull();
    expect(screen.queryByLabelText("Kommentar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Legg til e-post eller kommentar/ }));
    expect(screen.getByLabelText(/E-post/)).toHaveFocus();
    expect(screen.getByLabelText("Kommentar")).toBeInTheDocument();
  });

  it("viser ei lagra e-postadresse med ein gong", () => {
    localStorage.setItem(
      "rorlager.kunde.v1",
      JSON.stringify({ customer_name: "Ola", customer_phone: "", customer_email: "ola@firma.no", company: "", project: "" }),
    );
    visUttak();
    expect(screen.getByLabelText(/E-post/)).toHaveValue("ola@firma.no");
  });

  it("har summen ved knappen i den faste bunnen", () => {
    visUttak();
    const bunn = screen.getByRole("button", { name: /Send inn uttak/ }).closest("[data-fast-bunn]") as HTMLElement;
    expect(bunn).not.toBeNull();
    expect(within(bunn).getByText(/398,15/)).toBeInTheDocument();
  });
});

describe("bestillingskassen", () => {
  const visBestilling = () => {
    localStorage.setItem(
      "rorlager.bestilling.v1",
      JSON.stringify([
        { pipe_type_id: "t1", name: "Avløpsrør PVC", dimension: "110 mm", sku: "2251059", unit: "m", price: 79.63, quantity: 12 },
      ]),
    );
    return vis(<PickupCheckout />, "/bestill/kasse");
  };

  it("har kommentaren bak ei lenkje", () => {
    visBestilling();
    expect(screen.queryByLabelText("Kommentar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Legg til kommentar/ }));
    expect(screen.getByLabelText("Kommentar")).toHaveFocus();
  });

  it("viser ein kommentar frå utkastet med ein gong", () => {
    sessionStorage.setItem("rorlager.bestilling-utkast.v1", JSON.stringify({ kommentar: "Ring før dere kommer" }));
    visBestilling();
    expect(screen.getByLabelText("Kommentar")).toHaveValue("Ring før dere kommer");
  });

  it("forklarer berre det kunden har valt", () => {
    visBestilling();
    expect(screen.queryByText(/så snart kontoret har godkjent/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Henter nå" }));
    expect(screen.getByText(/så snart kontoret har godkjent/)).toBeInTheDocument();
  });

  it("har eks. og mva i oppsummeringa, og totalen berre ved knappen", async () => {
    visBestilling();
    await screen.findByRole("button", { name: /Bestill med betalingsplikt/ });
    const oppsummering = screen.getByRole("region", { name: "Oppsummering" });
    expect(within(oppsummering).getByText(/955,56/)).toBeInTheDocument();
    expect(within(oppsummering).getByText(/238,89/)).toBeInTheDocument();
    expect(within(oppsummering).queryByText(/1\s194,45/)).toBeNull();
  });

  it("har summen inkl. mva ved knappen i den faste bunnen", async () => {
    visBestilling();
    const knapp = await screen.findByRole("button", { name: /Bestill med betalingsplikt/ });
    const bunn = knapp.closest("[data-fast-bunn]") as HTMLElement;
    expect(bunn).not.toBeNull();
    expect(await within(bunn).findByText(/1\s194,45/)).toBeInTheDocument();
  });
});
