// Kassen for bestillingar: ingenting blir sendt utan dagens prisar, og eininga
// hugsar kunden berre når han har kryssa av for det.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { fetchCatalog, submitPickupOrder, requestEmailsInBackground } = vi.hoisted(() => ({
  fetchCatalog: vi.fn(),
  submitPickupOrder: vi.fn(),
  requestEmailsInBackground: vi.fn(),
}));

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchCatalog,
}));
vi.mock("@/lib/pickup-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pickup-orders")>()),
  submitPickupOrder,
  requestEmailsInBackground,
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ data: { vat_rate: 25, require_phone: false } }),
  useOrderSettings: () => ({
    data: { accept_orders: true, payment_terms_days: 14 },
    isPlaceholderData: false,
    isLoading: false,
  }),
}));
vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }) }));

import PickupCheckout from "@/pages/PickupCheckout";
import { lesKunde, skrivKunde, writePickupCart } from "@/lib/pickup-cart";
import { TOMT_SKJEMA } from "@/lib/pickup-form";

// Avkryssingsboksen frå Radix måler seg med ResizeObserver når ho står i eit
// skjema. jsdom har han ikkje.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const VARE = {
  id: "a",
  name: "PVC avløpsrør",
  dimension: "110 mm",
  sku: "PVC-110",
  unit: "m",
  price: 100,
  stock: 50,
  active: true,
};

const vis = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PickupCheckout />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const sendKnapp = () => screen.getByRole("button", { name: /Bestill med betalingsplikt/ });
const huskBoks = () => screen.getByRole("checkbox", { name: "Husk opplysningene mine på denne enheten" });

/** Fyller ut det som manglar for ein privatperson som hentar no. */
const fyllUt = () => {
  fireEvent.click(screen.getByRole("button", { name: /Henter nå/ }));
  fireEvent.click(screen.getByRole("button", { name: "Privatperson" }));
  fireEvent.change(screen.getByLabelText(/^Navn/), { target: { value: "Ola Privat" } });
  fireEvent.change(screen.getByLabelText(/^Gateadresse/), { target: { value: "Bakkevegen 3" } });
  fireEvent.change(screen.getByLabelText(/^Postnr/), { target: { value: "5700" } });
  fireEvent.change(screen.getByLabelText(/^Sted/), { target: { value: "Voss" } });
  fireEvent.change(screen.getByLabelText(/^E-post/), { target: { value: "ola@privat.no" } });
};

const send = async () => {
  await waitFor(() => expect(sendKnapp()).toBeEnabled());
  fireEvent.click(sendKnapp());
  await waitFor(() => expect(requestEmailsInBackground).toHaveBeenCalledWith("ny-id"));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  writePickupCart([
    { pipe_type_id: "a", name: "PVC avløpsrør", dimension: "110 mm", sku: "PVC-110", unit: "m", price: 90, quantity: 2 },
  ]);
  fetchCatalog.mockResolvedValue([VARE]);
  submitPickupOrder.mockResolvedValue({ id: "ny-id", order_number: 1 });
});

describe("dagens prisar", () => {
  it("knappen står sperra, og seier kvifor, til prisane er henta", async () => {
    fetchCatalog.mockReturnValue(new Promise(() => {}));
    vis();
    expect(sendKnapp()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Henter dagens priser");
  });

  it("feilar hentinga, kan kunden prøve igjen", async () => {
    fetchCatalog.mockRejectedValueOnce(new Error("nede")).mockResolvedValue([VARE]);
    vis();
    fireEvent.click(await screen.findByRole("button", { name: "Prøv igjen" }));
    await waitFor(() => expect(sendKnapp()).toBeEnabled());
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });
});

describe("å hugse kunden", () => {
  it("er av når ingenting er lagra, og då blir ingenting lagra", async () => {
    vis();
    fyllUt();
    expect(huskBoks()).not.toBeChecked();
    await send();
    expect(lesKunde()).toEqual({});
  });

  it("med kryss blir kontaktopplysningane hugsa til neste gong", async () => {
    vis();
    fyllUt();
    fireEvent.click(huskBoks());
    await send();
    expect(lesKunde()).toMatchObject({ navn: "Ola Privat", epost: "ola@privat.no", gate: "Bakkevegen 3" });
  });

  it("har kunden kryssa av før, står krysset – og tek han det bort, blir det lagra sletta", async () => {
    skrivKunde({ ...TOMT_SKJEMA, kundetype: "privat", navn: "Ola Privat", epost: "ola@privat.no" });
    vis();
    fyllUt();
    expect(huskBoks()).toBeChecked();
    fireEvent.click(huskBoks());
    await send();
    expect(lesKunde()).toEqual({});
  });
});
