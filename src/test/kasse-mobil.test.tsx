import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Checkout from "@/pages/Checkout";
import PickupCheckout from "@/pages/PickupCheckout";

// Kassane skal fungere på ein telefon: det valfrie ligg bak ei lenkje, og
// summen står saman med knappen i den faste bunnen. Ein kunde utan innlogging
// må skrive noko i e-postfeltet; ein tilsett som er logga inn, tek ut på
// brukaren sin og skriv berre kva jobb varene skal til.

const innlogga = vi.hoisted(() => ({ epost: null as string | null, loggUt: vi.fn() }));
const sendUttak = vi.hoisted(() =>
  vi.fn(async () => ({ id: "o1", order_number: 1, created_at: "", customer_name: "", lines: [], total: 0 })),
);

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    checking: false,
    email: innlogga.epost,
    role: innlogga.epost ? "lager" : null,
    roleKnown: Boolean(innlogga.epost),
    roleFailed: false,
    prøvRolleIgjen: () => {},
    isProsjekt: false,
    isKontor: Boolean(innlogga.epost),
  }),
  useMeg: () => ({ data: innlogga.epost ? { epost: innlogga.epost, navn: "Leif Lager" } : null }),
  loggUt: (...a: unknown[]) => innlogga.loggUt(...a),
}));

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
  submitOrder: (...a: unknown[]) => sendUttak(...(a as [])),
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
  innlogga.epost = null;
  innlogga.loggUt.mockReset();
  sendUttak.mockClear();
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

  it("har e-posten synleg og påkravd, og kommentaren bak ei lenkje", () => {
    visUttak();
    expect(screen.getByLabelText(/E-post/)).toBeInTheDocument();
    expect(screen.getByText("E-post").parentElement).toHaveTextContent("*");
    expect(screen.queryByLabelText("Kommentar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Legg til kommentar/ }));
    expect(screen.getByLabelText("Kommentar")).toHaveFocus();
  });

  it("sender ikkje utan e-post – men «ingen» er godt nok", async () => {
    visUttak();
    fireEvent.change(screen.getByLabelText(/Navn/), { target: { value: "Ola Kunde" } });
    fireEvent.change(screen.getByLabelText(/Telefon/), { target: { value: "900 00 000" } });
    fireEvent.click(screen.getByRole("button", { name: /Send inn uttak/ }));
    expect(sendUttak).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/E-post/), { target: { value: "ingen" } });
    fireEvent.click(screen.getByRole("button", { name: /Send inn uttak/ }));
    await waitFor(() => expect(sendUttak).toHaveBeenCalledWith(expect.objectContaining({ customer_email: "ingen" })));
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

  it("innlogga: uttaket står på brukaren, og berre jobben blir spurd om", () => {
    innlogga.epost = "lager@hauge.no";
    visUttak();
    expect(screen.getByText("Registreres på deg")).toBeInTheDocument();
    expect(screen.getByText(/Leif Lager/)).toBeInTheDocument();
    expect(screen.getByText(/lager@hauge\.no/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Navn/)).toBeNull();
    expect(screen.queryByLabelText(/Telefon/)).toBeNull();
    expect(screen.queryByLabelText(/E-post/)).toBeNull();
    expect(screen.getByLabelText(/Jobb eller prosjekt/)).toBeInTheDocument();
  });

  it("innlogga: krev jobben, og sender uttaket på brukaren", async () => {
    innlogga.epost = "lager@hauge.no";
    visUttak();
    fireEvent.click(screen.getByRole("button", { name: /Send inn uttak/ }));
    expect(sendUttak).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Jobb eller prosjekt/), { target: { value: "Byggefelt Vest" } });
    fireEvent.click(screen.getByRole("button", { name: /Send inn uttak/ }));
    await waitFor(() =>
      expect(sendUttak).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_name: "Leif Lager",
          customer_email: "lager@hauge.no",
          customer_phone: null,
          company: null,
          project: "Byggefelt Vest",
          signature: null,
        }),
      ),
    );
    // Eit delt nettbrett skal ikkje hugse den tilsette som neste kunde
    expect(localStorage.getItem("rorlager.kunde.v1")).toBeNull();
  });

  it("innlogga: «Ikke deg?» loggar ut", () => {
    innlogga.epost = "lager@hauge.no";
    visUttak();
    fireEvent.click(screen.getByRole("button", { name: /Ikke deg\? Logg ut/ }));
    expect(innlogga.loggUt).toHaveBeenCalled();
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
