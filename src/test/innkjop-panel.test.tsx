import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async () => ({ data: [{ pipe_type_id: "a", forbruk: 180 }], error: null }) },
}));

import { InnkjopPanel } from "@/components/admin/InnkjopPanel";

const vare = (over: object) => ({
  id: "a",
  name: "PVC",
  dimension: "110 mm",
  sku: "2251059",
  unit: "m",
  stock: 10,
  low_stock_threshold: 20,
  cost_price: 60,
  active: true,
  ...over,
});

describe("innkjøpsforslaget", () => {
  it("viser forslaget med antal, og tel det som er kryssa av", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <InnkjopPanel
          varer={[vare({}), vare({ id: "b", name: "Bend", stock: 100 })] as never}
          visKostpris
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
    // 180 m på 90 dagar = 2 m/dag: 20 + 60 − 10 = 70
    expect(await screen.findByDisplayValue("70")).toBeInTheDocument();
    expect(screen.queryByText(/Bend/)).toBeNull();
    expect(screen.getByText(/1 vare valgt · ca. 4 200,00 kr i innkjøp/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Ta med PVC 110 mm"));
    expect(screen.getByText(/0 varer valgt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
  });
});
