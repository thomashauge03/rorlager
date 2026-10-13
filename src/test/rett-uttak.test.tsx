// Kontoret rettar eit uttak: dialogane sender det rette til basen.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const kall = vi.hoisted(() => ({ byttProsjekt: vi.fn(), endreAnnet: vi.fn(), byttVare: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/suggestions", () => ({
  byttProsjekt: (...a: unknown[]) => kall.byttProsjekt(...a),
  endreAnnet: (...a: unknown[]) => kall.endreAnnet(...a),
  byttVare: (...a: unknown[]) => kall.byttVare(...a),
}));
vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchProsjektliste: async () => [
    { id: "p1", project_number: 9000123, name: "Storgata 4" },
    { id: "p2", project_number: 9000124, name: "Havnevegen 12" },
  ],
  fetchPipeTypes: async () => [
    { id: "t-pvc", name: "Avløpsrør PVC", dimension: "110 mm", sku: "2251059", unit: "m", price: 79.63, stock: 40, active: true, category_name: "Avløp" },
    { id: "t-pe", name: "PE-rør", dimension: "180 mm", sku: "3300180", unit: "m", price: 300, stock: 20, active: true, category_name: "PE" },
    { id: "t-bend", name: "Bend", dimension: "110 mm", sku: "2252279", unit: "stk", price: 48.75, stock: 10, active: true, category_name: "Deler" },
  ],
}));

import { ByttProsjektDialog, ByttVareDialog, EndreAnnetDialog } from "@/components/admin/RettUttak";

const vis = (el: JSX.Element) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{el}</QueryClientProvider>);

const annet = { id: "l1", name: "180 rør noe 180mm", dimension: null, unit: "m", quantity: 5, pipe_type_id: null, is_annet: true };
const pvc = { id: "l2", name: "Avløpsrør PVC", dimension: "110 mm", unit: "m", quantity: 3, pipe_type_id: "t-pvc", is_annet: false };

beforeEach(() => {
  Object.values(kall).forEach((f) => f.mockReset().mockResolvedValue(undefined));
});

describe("bytt prosjekt", () => {
  it("vel frå lista", async () => {
    vis(<ByttProsjektDialog order={{ id: "o1", order_number: 4, project: "Testnytt", project_id: null }} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("radio", { name: /Storgata 4/ }));
    fireEvent.click(screen.getByRole("button", { name: "Bytt prosjekt" }));
    await waitFor(() => expect(kall.byttProsjekt).toHaveBeenCalledWith("o1", { projectId: "p1" }));
  });

  it("fritekst via «Annet»", async () => {
    vis(<ByttProsjektDialog order={{ id: "o1", order_number: 4, project: null, project_id: null }} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("radio", { name: /Annet – skriv selv/ }));
    expect(screen.getByRole("button", { name: "Bytt prosjekt" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Skriv hvor varene skal"), { target: { value: "Verkstedet" } });
    fireEvent.click(screen.getByRole("button", { name: "Bytt prosjekt" }));
    await waitFor(() => expect(kall.byttProsjekt).toHaveBeenCalledWith("o1", { tekst: "Verkstedet" }));
  });
});

describe("endre namn", () => {
  it("sender namn og dimensjon", async () => {
    vis(<EndreAnnetDialog line={annet} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Hva er det?"), { target: { value: "PE-rør" } });
    fireEvent.change(screen.getByLabelText("Dimensjon"), { target: { value: "180 mm" } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre navn" }));
    await waitFor(() => expect(kall.endreAnnet).toHaveBeenCalledWith("l1", "PE-rør", "180 mm"));
  });
});

describe("bytt vare", () => {
  it("annet-linja: søk, vel, bytt – og forslaget blir nemnt", async () => {
    vis(<ByttVareDialog line={annet} lagerTrekt onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Søk etter vare"), { target: { value: "PE" } });
    fireEvent.click(await screen.findByRole("button", { name: /PE-rør 180 mm/ }));
    expect(screen.getByText(/Forslaget merkes som løst/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bytt vare" }));
    await waitFor(() => expect(kall.byttVare).toHaveBeenCalledWith("l1", "t-pe"));
  });

  it("feil rør: den gamle går tilbake, og ei anna eining blir åtvara om", async () => {
    vis(<ByttVareDialog line={pvc} lagerTrekt onClose={() => {}} />);
    // Den same vara står ikkje i lista
    await screen.findByRole("button", { name: /Bend 110 mm/ });
    expect(screen.queryByRole("button", { name: /Avløpsrør PVC 110 mm/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Bend 110 mm/ }));
    expect(screen.getByText(/legges tilbake på lageret/)).toBeInTheDocument();
    expect(screen.getByText(/selges i stk/)).toBeInTheDocument();
  });

  it("bestilling som ikkje er godkjend: lageret blir ikkje nemnt som trekt", async () => {
    vis(<ByttVareDialog line={pvc} lagerTrekt={false} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /PE-rør 180 mm/ }));
    expect(screen.getByText(/trekkes når bestillingen godkjennes/)).toBeInTheDocument();
  });
});
