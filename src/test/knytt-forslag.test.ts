import { beforeEach, describe, expect, it, vi } from "vitest";

// Basen gjer jobben; her blir det berre sjekka kva veg kvart forslag går.
const { rpc, update } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      update: (rad: object) => {
        update(rad);
        return { eq: async () => ({ error: null }) };
      },
    }),
  },
}));

import { knyttTilVare, type Suggestion } from "@/lib/suggestions";

const forslag = (id: string, invoice_id: string | null, order_line_id: string | null = `l-${id}`) =>
  ({
    id,
    order_line_id,
    order: { order_number: 1, kind: "uttak", invoice_id, status: "ny" },
  }) as unknown as Suggestion;

beforeEach(() => vi.clearAllMocks());

describe("knyttTilVare", () => {
  it("bytter linja når ordren står og ikke er fakturert", async () => {
    expect(await knyttTilVare([forslag("a", null)], "v1")).toEqual({ linjer: 1, berreForslag: 0 });
    expect(rpc).toHaveBeenCalledWith("pipe_bytt_vare", { p_line_id: "l-a", p_pipe_type_id: "v1" });
    expect(update).not.toHaveBeenCalled();
  });

  it("knytter bare forslaget når ordren er fakturert eller slettet", async () => {
    expect(await knyttTilVare([forslag("b", "i1"), forslag("c", null, null)], "v1")).toEqual({
      linjer: 0,
      berreForslag: 2,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "opprettet", pipe_type_id: "v1" }));
  });
});
