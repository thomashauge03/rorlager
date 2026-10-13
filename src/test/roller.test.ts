import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { erKontorRolle, heimFor } from "@/lib/auth";

describe("kven ser adminpanelet", () => {
  it.each(["super_admin", "admin", "kontor", "lager"])("%s er kontor", (r) => expect(erKontorRolle(r)).toBe(true));
  it.each(["ansatt", "prosjekt", "", "adminx", "Admin"])("«%s» er ikkje kontor", (r) =>
    expect(erKontorRolle(r)).toBe(false),
  );
  it("null er ikkje kontor", () => expect(erKontorRolle(null)).toBe(false));
});

describe("kvar ei rolle høyrer heime", () => {
  it("kontoret i adminpanelet", () => expect(heimFor("lager")).toBe("/admin"));
  it("byggjeplassen på prosjektsida", () => expect(heimFor("prosjekt")).toBe("/prosjekt"));
  it("ein vanleg tilsett på framsida", () => expect(heimFor("ansatt")).toBe("/"));
  it("ei rolle ingen har tenkt på, på framsida – ikkje i panelet", () => expect(heimFor("sjef")).toBe("/"));
});
