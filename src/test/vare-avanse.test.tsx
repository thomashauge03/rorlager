import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/settings")>()),
  useOfficeSettings: () => ({ data: { markup_percent: 35 }, isPlaceholderData: false }),
}));

import { PipeDialog } from "@/components/admin/StockTab";

const vis = (pipe: unknown = null) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PipeDialog pipe={pipe as never} allPipes={[]} categories={[]} onClose={() => {}} />
    </QueryClientProvider>,
  );

describe("ny vare med innkjøpspris", () => {
  it("får salgsprisen regnet ut med avansen", () => {
    vis();
    fireEvent.change(screen.getByLabelText(/Innkjøpspris fra Dahl/), { target: { value: "63,70" } });
    expect(screen.getByLabelText(/Salgspris eks. mva/)).toHaveValue("86,00");
    expect(screen.getByText(/innkjøpspris \+ 35 % avanse/)).toBeInTheDocument();
  });

  it("en pris skrevet for hånd blir stående, men avansen kan tas tilbake", () => {
    vis();
    const pris = screen.getByLabelText(/Salgspris eks. mva/);
    fireEvent.change(pris, { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText(/Innkjøpspris fra Dahl/), { target: { value: "100" } });
    expect(pris).toHaveValue("99");
    fireEvent.click(screen.getByRole("button", { name: "Bruk den" }));
    expect(pris).toHaveValue("135,00");
  });
});

describe("eksisterende vare", () => {
  it("blir ikke regnet om når innkjøpsprisen endres, men viser hva avansen gir", () => {
    vis({ id: "a", name: "PVC", dimension: null, sku: null, qr_slug: "pvc", unit: "m", price: 80, cost_price: 60, low_stock_threshold: 0, active: true, prishopp_faktor: 1 });
    fireEvent.change(screen.getByLabelText(/Innkjøpspris fra Dahl/), { target: { value: "70" } });
    expect(screen.getByLabelText(/Salgspris eks. mva/)).toHaveValue("80");
    // 70 × 1,35 = 94,50, runda opp til hel krone
    expect(screen.getByText(/blir det 95,00 kr/)).toBeInTheDocument();
  });
});
