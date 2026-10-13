import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { grupperForslag, type Suggestion } from "@/lib/suggestions";

const f = (id: string, name: string, created_at: string, over: Partial<Suggestion> = {}) =>
  ({ id, name, dimension: "40 mm", unit: "m", quantity: 5, created_at, ...over }) as Suggestion;

describe("grupperForslag", () => {
  it("samlar same vare uansett store bokstavar og mellomrom, nyaste gruppe først", () => {
    const grupper = grupperForslag([
      f("a", "PE-rør", "2026-10-01"),
      f("b", "pe-rør ", "2026-10-03"),
      f("c", "Bend", "2026-10-02"),
      f("d", "PE-rør", "2026-10-02", { unit: "stk" }),
    ]);
    expect(grupper.map((g) => g.map((s) => s.id))).toEqual([["b", "a"], ["c"], ["d"]]);
  });

  it("ulik dimensjon er ulike varer", () => {
    expect(grupperForslag([f("a", "PE-rør", "2026-10-01"), f("b", "PE-rør", "2026-10-02", { dimension: "50 mm" })])).toHaveLength(2);
  });
});
