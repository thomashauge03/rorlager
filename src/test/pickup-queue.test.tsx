// Kva kontoret får vite om e-posten etter ei godkjenning eller avvising, og at
// loggen blir lesen når ingenting blei sendt og ingenting feila: kundesida eller
// ei anna fane kan ha sendt e-posten først.

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { toast, approvePickupOrder, rejectPickupOrder, requestEmails, fetchOrderEmails } = vi.hoisted(() => ({
  toast: vi.fn(),
  approvePickupOrder: vi.fn(),
  rejectPickupOrder: vi.fn(),
  requestEmails: vi.fn(),
  fetchOrderEmails: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/pickup-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pickup-orders")>()),
  approvePickupOrder,
  rejectPickupOrder,
  requestEmails,
  fetchOrderEmails,
}));
vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchPipeTypes: vi.fn().mockResolvedValue([]),
}));

import { PickupDetails, PickupHandlingDialog, epostMelding } from "@/components/admin/PickupQueue";
import type { OrderWithLines } from "@/lib/types";

const IKKJE_SATT_OPP =
  "E-post er ikke satt opp, så kunden har ikke fått beskjed. Ring kunden, og skriv ut PDF-en til privatkunder ved henting.";
const FEKK = "Kunden har fått e-post.";
const GRENSE = "E-posten er ikke sendt ennå – dagens grense for e-post kan være nådd. Prøv igjen senere, eller ring kunden.";
const GJEKK_IKKJE = "E-posten gikk ikke. Prøv igjen fra bestillingen, eller ring kunden.";

describe("epostMelding", () => {
  it("seier frå når e-post ikkje er sett opp, og minner om PDF-en", () => {
    expect(epostMelding({ satt_opp: false, sendt: [], feilet: [] }, "klar")).toBe(IKKJE_SATT_OPP);
  });

  it("seier at kunden har fått e-post når ho gjekk no, eller loggen viser at ho alt er sendt", () => {
    expect(epostMelding({ satt_opp: true, sendt: ["klar"], feilet: [] }, "klar")).toBe(FEKK);
    expect(epostMelding({ satt_opp: true, sendt: [], feilet: [] }, "avvist", true)).toBe(FEKK);
  });

  it("ingenting sendt og ingenting feila er ikkje ein feil – grensa kan vere nådd", () => {
    expect(epostMelding({ satt_opp: true, sendt: [], feilet: [] }, "klar")).toBe(GRENSE);
    expect(epostMelding({ satt_opp: true, sendt: ["kvittering"], feilet: [] }, "klar")).toBe(GRENSE);
  });

  it("seier at e-posten ikkje gjekk når ho feila, eller funksjonen ikkje svarte", () => {
    expect(epostMelding({ satt_opp: true, sendt: [], feilet: ["avvist"] }, "avvist")).toBe(GJEKK_IKKJE);
    expect(epostMelding(null, "klar")).toBe(GJEKK_IKKJE);
  });
});

const ordre = (over: Partial<OrderWithLines> = {}) =>
  ({
    id: "o1",
    order_number: 1042,
    kind: "bestilling",
    status: "ny",
    stock_drawn_at: null,
    handled_at: null,
    customer_type: "privat",
    customer_name: "Ola",
    pickup_date: "2026-10-01",
    pickup_now: false,
    customer_message: null,
    billing_address: "Bakkevegen 3",
    lines: [],
    ...over,
  }) as unknown as OrderWithLines;

const medKlient = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const sisteMelding = async () => {
  await waitFor(() => expect(toast).toHaveBeenCalled());
  return toast.mock.calls.at(-1)?.[0] as { title: string; description: string };
};

beforeEach(() => {
  vi.clearAllMocks();
  approvePickupOrder.mockResolvedValue({});
  rejectPickupOrder.mockResolvedValue({});
  fetchOrderEmails.mockResolvedValue([]);
});

describe("godkjenning og avvising", () => {
  const godkjenn = () => {
    medKlient(<PickupHandlingDialog handling={{ type: "godkjenn", order: ordre() }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Godkjenn" }));
  };

  it("les loggen når ingenting blei sendt: har kundesida sendt «klar», har kunden fått e-post", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: [], feilet: [] });
    fetchOrderEmails.mockResolvedValue([{ id: "e1", type: "klar", sent_at: "2026-09-24T10:00:00Z" }]);
    godkjenn();
    expect((await sisteMelding()).description).toBe(FEKK);
    expect(fetchOrderEmails).toHaveBeenCalledWith("o1");
  });

  it("står «klar» ikkje som sendt i loggen, er grensa kanskje nådd", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: [], feilet: [] });
    fetchOrderEmails.mockResolvedValue([{ id: "e1", type: "klar", sent_at: null }]);
    godkjenn();
    expect((await sisteMelding()).description).toBe(GRENSE);
  });

  it("slår ikkje opp i loggen når e-posten gjekk no", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: ["klar"], feilet: [] });
    godkjenn();
    expect((await sisteMelding()).description).toBe(FEKK);
    expect(fetchOrderEmails).not.toHaveBeenCalled();
  });

  it("ved avvising tel berre «avvist» i loggen", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: [], feilet: [] });
    fetchOrderEmails.mockResolvedValue([{ id: "e1", type: "klar", sent_at: "2026-09-24T10:00:00Z" }]);
    medKlient(<PickupHandlingDialog handling={{ type: "avvis", order: ordre() }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Begrunnelse til kunden"), { target: { value: "Utgått" } });
    fireEvent.click(screen.getByRole("button", { name: "Avvis bestillingen" }));
    expect((await sisteMelding()).description).toBe(GRENSE);
  });
});

describe("«Send det som mangler»", () => {
  const send = (o: OrderWithLines) => {
    medKlient(<PickupDetails order={o} />);
    fireEvent.click(screen.getByRole("button", { name: "Send det som mangler" }));
  };
  const time = (timar: number) => new Date(Date.now() - timar * 3600 * 1000).toISOString();

  it("seier ikkje «alt er sendt» når «klar» manglar i loggen", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: [], feilet: [] });
    send(ordre({ status: "behandlet", stock_drawn_at: time(1), handled_at: time(1) }));
    const m = await sisteMelding();
    expect(m.title).toBe("Ikke sendt");
    expect(m.description).toBe(GRENSE);
  });

  it("seier at kunden har fått e-post når loggen viser det", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: [], feilet: [] });
    fetchOrderEmails.mockResolvedValue([{ id: "e1", type: "avvist", sent_at: time(0.5) }]);
    send(ordre({ status: "avvist", handled_at: time(1) }));
    const m = await sisteMelding();
    expect(m.title).toBe("Ingenting å sende");
    expect(m.description).toBe(FEKK);
  });

  it("er hendinga eldre enn eit døgn, blir det aldri sendt – då står det det", async () => {
    requestEmails.mockResolvedValue({ satt_opp: true, sendt: [], feilet: [] });
    send(ordre({ status: "behandlet", stock_drawn_at: time(30), handled_at: time(30) }));
    const m = await sisteMelding();
    expect(m.title).toBe("Ingenting å sende");
    expect(m.description).toBe("Alt er allerede sendt, eller hendelsen er eldre enn et døgn.");
  });
});
