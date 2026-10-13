// «Velg ditt eget passord»: den tilsette med mellombels passord skal velje eit
// nytt, og ingen andre skal sleppe inn her – sida spør ikkje etter det gamle.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { rpc, updateUser, getSession, toast } = vi.hoisted(() => ({
  rpc: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, auth: { updateUser, getSession, signOut: vi.fn() } },
}));

import NyttPassord from "@/pages/NyttPassord";
import { useKravOmNyttPassord } from "@/lib/auth";

/** Ei side bak innlogginga, slik useAuth ser henne. */
function Bak() {
  useKravOmNyttPassord("lager@hauge.no");
  return <p>Adminpanelet</p>;
}

/** Svara frå basen: merket, rolla og fjerninga av merket. */
const basen = ({ måBytte = true, rolle = "lager", fjern = { error: null } } = {}) =>
  rpc.mockImplementation(async (namn: string) => {
    if (namn === "hm_ma_bytte_passord") return { data: måBytte, error: null };
    if (namn === "hm_rolle") return { data: rolle, error: null };
    if (namn === "hm_passord_byttet") return { data: null, ...fjern };
    return { data: null, error: { message: `ukjent ${namn}` } };
  });

const vis = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/nytt-passord"]}>
        <Routes>
          <Route path="/nytt-passord" element={<NyttPassord />} />
          <Route path="/admin" element={<p>Adminpanelet</p>} />
          <Route path="/prosjekt" element={<p>Prosjektene</p>} />
          <Route path="/login" element={<p>Innlogginga</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const skriv = async (nytt: string, gjenta: string) => {
  fireEvent.change(await screen.findByLabelText("Nytt passord"), { target: { value: nytt } });
  fireEvent.change(screen.getByLabelText("Gjenta nytt passord"), { target: { value: gjenta } });
  fireEvent.click(screen.getByRole("button", { name: "Lagre passord" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { email: "lager@hauge.no" } } } });
  updateUser.mockResolvedValue({ error: null });
});

describe("første innlogging", () => {
  it("to like passord blir lagra, merket fjerna, og han kjem vidare", async () => {
    basen();
    vis();
    await skriv("mittegetpassord", "mittegetpassord");

    expect(await screen.findByText("Adminpanelet")).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith({ password: "mittegetpassord" });
    expect(rpc).toHaveBeenCalledWith("hm_passord_byttet");
  });

  it("ein prosjektbrukar hamnar på prosjekta", async () => {
    basen({ rolle: "prosjekt" });
    vis();
    await skriv("mittegetpassord", "mittegetpassord");
    expect(await screen.findByText("Prosjektene")).toBeTruthy();
  });

  it("ulike passord blir stoppa før noko blir sendt", async () => {
    basen();
    vis();
    await skriv("mittegetpassord", "mittegetpasord");
    expect((await screen.findByRole("alert")).textContent).toMatch(/ikke like/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("for kort blir stoppa", async () => {
    basen();
    vis();
    await skriv("kort", "kort");
    expect((await screen.findByRole("alert")).textContent).toMatch(/minst 8/);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("det same som det mellombelse: Supabase seier nei, og det står på norsk", async () => {
    basen();
    updateUser.mockResolvedValue({ error: { code: "same_password", message: "New password should be different" } });
    vis();
    await skriv("ABCDE-FGHJK-LMNPQ", "ABCDE-FGHJK-LMNPQ");
    expect((await screen.findByRole("alert")).textContent).toMatch(/annet passord enn det du fikk tildelt/);
    expect(rpc).not.toHaveBeenCalledWith("hm_passord_byttet");
  });

  it("passordet bytt, men merket feila: «Prøv igjen» prøver berre merket", async () => {
    basen({ fjern: { error: { message: "nett" } } });
    vis();
    await skriv("mittegetpassord", "mittegetpassord");
    expect((await screen.findByRole("alert")).textContent).toMatch(/Passordet er byttet/);

    basen();
    fireEvent.click(screen.getByRole("button", { name: "Prøv igjen" }));
    expect(await screen.findByText("Adminpanelet")).toBeTruthy();
    expect(updateUser).toHaveBeenCalledTimes(1);
  });
});

describe("vakta", () => {
  it("utan merke blir han send heim – sida spør ikkje etter det gamle passordet", async () => {
    basen({ måBytte: false });
    vis();
    expect(await screen.findByText("Adminpanelet")).toBeTruthy();
    expect(screen.queryByLabelText("Nytt passord")).toBeNull();
  });

  it("skriv han /admin rett i adresselinja, blir han send tilbake", async () => {
    basen();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin" element={<Bak />} />
            <Route path="/nytt-passord" element={<p>Velg passord</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Velg passord")).toBeTruthy();
  });

  it("utan merke blir han ståande", async () => {
    basen({ måBytte: false });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin" element={<Bak />} />
            <Route path="/nytt-passord" element={<p>Velg passord</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("hm_ma_bytte_passord"));
    expect(screen.getByText("Adminpanelet")).toBeTruthy();
  });

  it("utan økt går han til innlogginga", async () => {
    basen();
    getSession.mockResolvedValue({ data: { session: null } });
    vis();
    await waitFor(() => expect(screen.getByText("Innlogginga")).toBeTruthy());
  });
});
