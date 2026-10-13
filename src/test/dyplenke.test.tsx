// Dyplenker fra Innboks: parameteren valideres strengt, saken velger fanen,
// innloggingen sender bare tilbake til lokale /admin-stier, og fanene finner,
// markerer og åpner saken.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fetchOrders, findOrderByNumber, fetchAllProjectOrders, toast } = vi.hoisted(() => ({
  fetchOrders: vi.fn(),
  findOrderByNumber: vi.fn(),
  fetchAllProjectOrders: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchOrders,
  findOrderByNumber,
  fetchPipeTypes: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/projects")>()),
  fetchAllProjectOrders,
  fetchProjects: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/pickup-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pickup-orders")>()),
  useWaitingPickupOrders: () => ({ data: [] }),
  fetchOrderEmails: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/settings", () => ({
  useSettings: () => ({ data: { vat_rate: 25, company_name: "Hauge Maskin AS" } }),
  useOrderSettings: () => ({ data: { payment_terms_days: 14 } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));

import { faneFor, lesDyplenke, lesNummer, tryggNeste } from "@/lib/dyplenke";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { ToOrderTab } from "@/components/admin/ToOrderTab";
import type { OrderWithLines, ProjectOrderWithLines } from "@/lib/types";

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

const medKlient = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("parameteren", () => {
  it("godtar bare positive heltall", () => {
    expect(lesNummer("1042")).toBe(1042);
    expect(lesNummer(" 7 ")).toBe(7);
    for (const ugyldig of [null, "", "0", "-3", "1.5", "1e3", "12abc", "<b>1</b>", "1234567890", "0x10"]) {
      expect(lesNummer(ugyldig)).toBeNull();
    }
  });

  it("saken bestemmer fanen, også når fane peker et annet sted", () => {
    const d = lesDyplenke(new URLSearchParams("fane=prosjekt&behov=12"));
    expect(d).toEqual({ type: "behov", nummer: 12 });
    expect(faneFor(d!)).toBe("abestille");
    expect(faneFor({ type: "mottak", nummer: 3 })).toBe("abestille");
    expect(faneFor({ type: "ordre", nummer: 3 })).toBe("bestillinger");
    expect(lesDyplenke(new URLSearchParams("fane=bestillinger&ordre=abc"))).toBeNull();
  });

  it("vare og forslag kommer på id, og bare en gyldig uuid slipper gjennom", () => {
    const id = "00000000-0000-0000-0000-0000000000AB";
    const vare = lesDyplenke(new URLSearchParams(`fane=lager&vare=${id}`));
    expect(vare).toEqual({ type: "vare", id: id.toLowerCase() });
    expect(faneFor(vare!)).toBe("lager");
    expect(faneFor(lesDyplenke(new URLSearchParams(`forslag=${id}`))!)).toBe("forslag");
    for (const ugyldig of ["", "abc", `${id}x`, "' or 1=1", `"]<b>`]) {
      expect(lesDyplenke(new URLSearchParams({ vare: ugyldig }))).toBeNull();
    }
  });
});

describe("next etter innlogging", () => {
  it("slipper gjennom lokale /admin-stier med query", () => {
    expect(tryggNeste("/admin?fane=bestillinger&ordre=1042")).toBe("/admin?fane=bestillinger&ordre=1042");
    expect(tryggNeste("/admin")).toBe("/admin");
  });

  it("avviser alt som kan føre ut av appen", () => {
    for (const farlig of [
      null,
      "https://ondsinnet.no/admin",
      "//ondsinnet.no",
      "/admin//ondsinnet.no",
      "/\\ondsinnet.no",
      "/admin\\..\\x",
      "/administrator",
      "/prosjekt",
      "javascript:alert(1)",
    ]) {
      expect(tryggNeste(farlig)).toBeNull();
    }
  });
});

const ordre = (over: Partial<OrderWithLines> = {}) =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    order_number: 1042,
    created_at: new Date().toISOString(),
    kind: "uttak",
    status: "behandlet",
    stock_drawn_at: new Date().toISOString(),
    handled_at: null,
    customer_type: null,
    customer_name: "Kari Kunde",
    customer_email: null,
    customer_phone: null,
    company: null,
    org_number: null,
    billing_address: null,
    pickup_date: null,
    pickup_now: false,
    project: null,
    comment: null,
    signature: null,
    admin_note: null,
    invoice_id: null,
    total: 100,
    lines: [],
    ...over,
  }) as unknown as OrderWithLines;

describe("Bestillinger med ?ordre=", () => {
  it("setter perioden til dagen ordren kom inn, markerer raden og åpner panelet", async () => {
    const gammel = ordre({ created_at: "2025-03-14T10:00:00Z" });
    findOrderByNumber.mockResolvedValue({ id: gammel.id, created_at: gammel.created_at });
    fetchOrders.mockImplementation(async (f: { from: string; to: string }) =>
      f.from === "2025-03-14" && f.to === "2025-03-14" ? [gammel] : [],
    );

    medKlient(<OrdersTab ordre={1042} />);

    const panel = within(await screen.findByRole("dialog", {}, { timeout: 3000 }));
    expect(panel.getByText("Uttak #1042")).toBeInTheDocument();
    expect(findOrderByNumber).toHaveBeenCalledWith(1042);
    expect(screen.getByLabelText("Fra dato")).toHaveValue("2025-03-14");
    expect(document.querySelector(`[data-dyplenke="${gammel.id}"]`)).toHaveClass("hm-dyplenke");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
  });

  it("sier rolig fra når ordren ikke finnes, og gjør ingenting mer", async () => {
    findOrderByNumber.mockResolvedValue(null);
    fetchOrders.mockResolvedValue([]);

    medKlient(<OrdersTab ordre={999} />);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Fant ikke ordre 999.", description: "Den kan være slettet." }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

const behov = (over: Partial<ProjectOrderWithLines> = {}) =>
  ({
    id: "22222222-2222-2222-2222-222222222222",
    order_number: 12,
    project_id: "p1",
    status: "bestilt",
    created_at: new Date().toISOString(),
    requested_by_name: "Per Plass",
    needed_by: null,
    expected_at: null,
    note: null,
    supplier: null,
    supplier_ref: null,
    office_note: null,
    lines: [],
    receipts: [],
    ...over,
  }) as unknown as ProjectOrderWithLines;

describe("Å bestille med ?behov= og ?mottak=", () => {
  it("bytter til utsnittet behovet står i, markerer det og åpner panelet", async () => {
    const b = behov();
    fetchAllProjectOrders.mockResolvedValue([b]);

    medKlient(<ToOrderTab behov={12} />);

    await screen.findByRole("dialog", {}, { timeout: 3000 });
    // Panelet gjør resten av siden aria-hidden, derav hidden: true.
    expect(screen.getByRole("button", { name: /Underveis/, pressed: true, hidden: true })).toBeInTheDocument();
    expect(document.querySelector(`[data-dyplenke="behov-${b.id}"]`)).toHaveClass("hm-dyplenke");
  });

  it("finner mottaket på nummeret og markerer kortet", async () => {
    const r = {
      id: "33333333-3333-3333-3333-333333333333",
      receipt_number: 7,
      received_at: new Date().toISOString(),
      received_by_name: "Per Plass",
      no_photo_reason: null,
      note: null,
      lines: [],
      photos: [],
    };
    fetchAllProjectOrders.mockResolvedValue([behov({ status: "mottatt", receipts: [r] as never })]);

    medKlient(<ToOrderTab mottak={7} />);

    await waitFor(() =>
      expect(document.querySelector(`[data-dyplenke="mottak-${r.id}"]`)).toHaveClass("hm-dyplenke"),
    );
    expect(screen.getByRole("button", { name: /Mottak/, pressed: true })).toBeInTheDocument();
  });

  it("sier fra om et behov som er trukket tilbake", async () => {
    fetchAllProjectOrders.mockResolvedValue([]);

    medKlient(<ToOrderTab behov={55} />);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: "Fant ikke behov 55.", description: "Det kan være trukket tilbake." }),
    );
  });
});
