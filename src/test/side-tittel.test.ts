import { describe, expect, it } from "vitest";
import { tittelFor } from "@/components/SideTittel";

describe("tittelen i fana", () => {
  it.each([
    ["/", "Rør på lager – Rørlager Hauge Maskin"],
    ["/r/avlopsror-pvc-110-mm", "Rør – Rørlager Hauge Maskin"],
    ["/kasse", "Send inn uttak – Rørlager Hauge Maskin"],
    ["/bestill/kasse", "Fullfør bestillingen – Rørlager Hauge Maskin"],
    ["/bestill", "Bestill til henting – Rørlager Hauge Maskin"],
    ["/admin/brukere", "Brukere – Rørlager Hauge Maskin"],
    ["/admin", "Adminpanel – Rørlager Hauge Maskin"],
    ["/prosjekt/abc/behov", "Meld inn behov – Rørlager Hauge Maskin"],
    ["/prosjekt/abc/mottak/def", "Mottakskontroll – Rørlager Hauge Maskin"],
    ["/prosjekt/abc", "Prosjekt – Rørlager Hauge Maskin"],
  ])("%s", (sti, tittel) => expect(tittelFor(sti)).toBe(tittel));

  it("ei ukjend side får namnet på appen", () => expect(tittelFor("/tull")).toBe("Rørlager Hauge Maskin"));
});
