// Innstillingane: eit tømt felt for betalingsfristen skal stoppast med ei
// melding, ikkje lagrast som «0 dager».

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const { toast, saveSettings } = vi.hoisted(() => ({ toast: vi.fn(), saveSettings: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders")>()),
  fetchPipeTypes: vi.fn().mockResolvedValue([]),
  fetchCategories: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/settings", () => ({
  saveSettings,
  useOfficeSettings: () => ({
    isPlaceholderData: false,
    data: {
      id: 1,
      company_name: "Hauge Maskin AS",
      org_number: "974760673",
      address: "Industrivegen 1",
      phone: "56 00 00 00",
      email: "post@hauge.no",
      intro_text: null,
      pickup_note: null,
      vat_rate: 25,
      markup_percent: 20,
      show_prices: true,
      require_phone: true,
      require_signature: false,
      accept_orders: false,
      order_email: null,
      payment_terms_days: 14,
      updated_at: "2026-09-24T10:00:00Z",
    },
  }),
}));

import { SettingsTab } from "@/components/admin/SettingsTab";

describe("betalingsfristen", () => {
  it("eit tomt felt blir ikkje lagra som 0 dagar", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SettingsTab />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Betalingsfrist (dager)"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre innstillinger" }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls.at(-1)?.[0]).toMatchObject({
      title: "Klarte ikke å lagre",
      description: "Betalingsfristen må fylles ut (0–90 dager).",
    });
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
