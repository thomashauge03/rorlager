// Kva utlogginga tek med seg – og kva ho absolutt ikkje skal ta med seg.
//
// Dette er ein regresjonstest for ein feil som kosta data: loggUt() sveipa
// «rorlager.prosjekt.*» og tok med utkastet, altså lista over varer plassen
// hadde tasta inn. Ho blir med vilje bevart når ei innsending feilar, så
// «feila innsending, så logga eg ut og inn igjen» var tolv varelinjer borte.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// vi.mock blir heist til toppen av fila, så mocken kan ikkje lukke over ein
// vanleg const – han finst ikkje enno når fabrikken køyrer. vi.hoisted flyttar
// oppsettet opp saman med han.
const { signOut } = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut }, rpc: vi.fn() },
}));

import { loggUt } from "@/lib/auth";

const NAVN = "rorlager.prosjekt.navn.kari@haugemaskin.no";
const UTKAST = "rorlager.prosjekt.utkast.kari@haugemaskin.no.7f3c";
const KURV = "rorlager.handlekurv";

describe("loggUt", () => {
  beforeEach(() => {
    localStorage.clear();
    signOut.mockClear();
  });

  it("tømmer navnet, så neste mann på nettbrettet ikke arver det", async () => {
    localStorage.setItem(NAVN, "Kari Nordmann");
    await loggUt(new QueryClient());
    expect(localStorage.getItem(NAVN)).toBeNull();
  });

  it("lar utkastet ligge – det er brukerens egne varelinjer", async () => {
    localStorage.setItem(NAVN, "Kari Nordmann");
    localStorage.setItem(UTKAST, JSON.stringify([{ name: "110 mm rør" }]));
    await loggUt(new QueryClient());
    expect(localStorage.getItem(UTKAST)).not.toBeNull();
  });

  it("rører ikke handlekurven i uttaksdelen", async () => {
    localStorage.setItem(KURV, "[]");
    await loggUt(new QueryClient());
    expect(localStorage.getItem(KURV)).toBe("[]");
  });

  it("logger faktisk ut", async () => {
    await loggUt(new QueryClient());
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("kaster ikke når localStorage er stengt (privat modus)", async () => {
    const orig = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    await expect(loggUt(new QueryClient())).resolves.toBeUndefined();
    if (orig) Object.defineProperty(window, "localStorage", orig);
  });
});
