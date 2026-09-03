// «Meld inn behov»: byggjeplassen set saman lista over kva dei treng.
//
// Ingen prisar her, med vilje. Prosjektbrukaren skal ikkje sjå innkjøpspris, og
// lista er ikkje eit fakturagrunnlag – ho er ei bestilling til kontoret.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine, Plus, Search, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/hooks/use-toast";
import { QK, fetchCatalog } from "@/lib/orders";
import { createProjectOrder, fetchProject, type NyLinje } from "@/lib/projects";
import { useAuth } from "@/lib/auth";
import { matchesSearch } from "@/lib/stock";
import { parseNum, pipeLabel } from "@/lib/format";

const NAVN_NØKKEL = "rorlager.prosjekt.navn";
const UTKAST_NØKKEL = (id: string) => `rorlager.prosjekt.utkast.${id}`;

/** Så mange treff blir viste om gongen. Står som ei konstant fordi talet blir
 *  vist til brukaren når lista er kappa. */
const TREFF_TAK = 8;

const lesNavn = () => {
  try {
    return localStorage.getItem(NAVN_NØKKEL) ?? "";
  } catch {
    return "";
  }
};

const skrivNavn = (v: string) => {
  try {
    localStorage.setItem(NAVN_NØKKEL, v);
  } catch {
    /* ignorer – berre ei bekvemmelegheit */
  }
};

/** Linja slik ho ligg medan lista blir bygd. Antal som tekst, som elles i appen. */
type Utkast = NyLinje & { key: string; antalTekst: string };

/*
 * Lista overlever at sida blir forlaten.
 *
 * Ho låg berre i minnet: tilbakeknappen, ein telefon som ringer, eller ei fane
 * OS-et kastar, og alt var borte. Handlekurven i uttaksdelen har alltid gjort
 * det motsette (cart.ts), og dette er nøyaktig same situasjonen – berre med
 * hanskar på og dårlegare dekning.
 */
const lesUtkast = (id: string): Utkast[] => {
  try {
    const raw = localStorage.getItem(UTKAST_NØKKEL(id));
    return raw ? (JSON.parse(raw) as Utkast[]) : [];
  } catch {
    return [];
  }
};

const skrivUtkast = (id: string, linjer: Utkast[]) => {
  try {
    if (linjer.length === 0) localStorage.removeItem(UTKAST_NØKKEL(id));
    else localStorage.setItem(UTKAST_NØKKEL(id), JSON.stringify(linjer));
  } catch {
    /* ignorer – berre ei bekvemmelegheit */
  }
};

export default function ProjectRequest() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth(() => navigate("/login", { replace: true }));
  const klar = !auth.checking && !!auth.email;

  const [søk, setSøk] = useState("");
  const [linjer, setLinjer] = useState<Utkast[]>(() => lesUtkast(id));
  const [navn, setNavn] = useState(lesNavn);
  const [trengsInnen, setTrengsInnen] = useState("");
  const [notat, setNotat] = useState("");
  const [fritekst, setFritekst] = useState("");

  const project = useQuery({
    queryKey: [...QK.projects, id],
    queryFn: () => fetchProject(id),
    enabled: klar && !!id,
  });

  const katalog = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog, enabled: klar });

  // Berre når det er skrive noko: heile katalogen er ei dårleg liste å bla i på
  // ein telefon.
  const treff = useMemo(() => {
    const q = søk.trim();
    if (q.length < 2) return [];
    return (katalog.data ?? []).filter((t) => t.active && matchesSearch(t, q)).slice(0, TREFF_TAK);
  }, [katalog.data, søk]);

  // Kvar endring blir lagra med det same, så ingenting går tapt om sida blir
  // forlaten midt i.
  useEffect(() => {
    skrivUtkast(id, linjer);
  }, [id, linjer]);

  const leggTil = (linje: NyLinje) => {
    setLinjer((f) => [...f, { ...linje, key: `${Date.now()}-${f.length}`, antalTekst: "1" }]);
    // Søket blir STÅANDE. Skal du ha fem ting frå same serie, ville tømming
    // betydd å taste «110» fem gonger med hanskar på.
  };

  const settAntal = (key: string, tekst: string) =>
    setLinjer((f) => f.map((l) => (l.key === key ? { ...l, antalTekst: tekst } : l)));

  const fjern = (key: string) => setLinjer((f) => f.filter((l) => l.key !== key));

  /** Kor mange av denne vara som alt ligg i lista. */
  const alleredeLagtTil = (pipeTypeId: string) =>
    linjer.filter((l) => l.pipe_type_id === pipeTypeId).length;

  const leggTilFritekst = () => {
    const navnPåVara = fritekst.trim();
    if (!navnPåVara) return;
    leggTil({ pipe_type_id: null, name: navnPåVara, dimension: null, sku: null, unit: "stk", requested_qty: 1, line_note: null });
    setFritekst("");
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!navn.trim()) throw new Error("Skriv inn navnet ditt, så vet kontoret hvem som meldte behovet.");
      if (linjer.length === 0) throw new Error("Legg til minst én vare før du melder inn behovet.");

      const ferdige: NyLinje[] = linjer.map((l) => {
        const antal = parseNum(l.antalTekst);
        if (antal === null || antal <= 0) throw new Error(`Fyll inn et antall for «${l.name}».`);
        return {
          pipe_type_id: l.pipe_type_id,
          name: l.name,
          dimension: l.dimension,
          sku: l.sku,
          unit: l.unit,
          requested_qty: antal,
          line_note: l.line_note,
        };
      });

      skrivNavn(navn.trim());
      // Utkastet blir rydda i onSuccess, ikkje her: feilar innsendinga, skal
      // lista framleis liggje der brukaren la ho.
      return createProjectOrder({
        projectId: id,
        requestedByName: navn,
        neededBy: trengsInnen || null,
        note: notat.trim() || null,
        lines: ferdige,
      });
    },
    onSuccess: (order) => {
      skrivUtkast(id, []);
      queryClient.invalidateQueries({ queryKey: QK.projectOrders });
      toast({ title: "Behovet er meldt inn", description: `Bestilling #${order.order_number} ligger nå hos kontoret.` });
      navigate(`/prosjekt/${id}`, { replace: true });
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Behovet ble ikke meldt inn", description: error.message }),
  });

  if (auth.checking) {
    return (
      <div className="hm-page min-h-dvh flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Sjekker innlogging</span>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-dvh flex flex-col">
      <TopBar title="Meld inn behov" subtitle={project.data?.name ?? undefined} back={`/prosjekt/${id}`} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-3 pb-10 pt-4 sm:px-4">
        {/* ---------- Søk i katalogen ---------- */}
        <section className="hm-card p-3" aria-labelledby="finn-vare">
          <h2 id="finn-vare" className="mb-2 text-sm font-semibold text-foreground">
            Finn varen
          </h2>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Label htmlFor="behov-sok" className="sr-only">
              Søk i katalogen
            </Label>
            <Input
              id="behov-sok"
              value={søk}
              onChange={(e) => setSøk(e.target.value)}
              placeholder="Søk på navn, dimensjon eller varenummer"
              inputMode="search"
              className="h-11 pl-9 text-base"
            />
          </div>

          {katalog.isLoading ? (
            <Skeleton className="mt-3 h-11 w-full rounded-md" />
          ) : katalog.isError ? (
            /*
             * Utan denne greina fall ein feila katalog gjennom til «Ingen
             * treff», altså ei feil forklaring som aktivt bad folk skrive heile
             * bestillinga for hand. Kontoret fekk tolv fritekstlinjer å tyde og
             * ingen visste kvifor.
             */
            <div className="mt-3 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-3">
              <p className="text-sm font-semibold text-destructive">Varelista kunne ikke hentes</p>
              <p className="mt-1 text-sm text-foreground">
                Sjekk at du har dekning, og prøv igjen. Haster det, kan du skrive varene for hånd under.
              </p>
              <Button size="sm" variant="outline" className="mt-2 h-11" onClick={() => katalog.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : treff.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {treff.map((t) => {
                const antalIListe = alleredeLagtTil(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() =>
                        leggTil({
                          pipe_type_id: t.id,
                          name: t.name,
                          dimension: t.dimension,
                          sku: t.sku,
                          unit: t.unit,
                          requested_qty: 1,
                          line_note: null,
                        })
                      }
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 truncate text-sm">{pipeLabel(t.name, t.dimension)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {antalIListe > 0 ? (
                          <span className="hm-chip border border-success/30 bg-success/15 text-success">
                            {antalIListe} i lista
                          </span>
                        ) : null}
                        <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                );
              })}
              {treff.length === TREFF_TAK ? (
                <li className="pt-1 text-xs text-muted-foreground">Viser de {TREFF_TAK} første – søk smalere.</li>
              ) : null}
            </ul>
          ) : søk.trim().length >= 2 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Ingen treff. Skriv den inn for hånd under, så finner kontoret riktig vare.
            </p>
          ) : null}

          {/* Fritekst: byggjeplassen skal aldri måtte ringe fordi katalogen manglar noko */}
          <div className="mt-3 border-t border-border pt-3">
            <Label htmlFor="behov-fritekst" className="text-sm">
              Står den ikke i lista?
            </Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="behov-fritekst"
                value={fritekst}
                onChange={(e) => setFritekst(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    leggTilFritekst();
                  }
                }}
                placeholder="F.eks. kobling 110 mm, grå"
                className="h-11 text-base"
              />
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={leggTilFritekst}>
                <PencilLine className="mr-2 h-4 w-4" aria-hidden="true" />
                Legg til
              </Button>
            </div>
          </div>
        </section>

        {/* ---------- Lista som blir meldt inn ---------- */}
        <section className="mt-4" aria-labelledby="lista">
          <h2 id="lista" className="mb-2 text-sm font-semibold text-foreground">
            Dette melder du inn
          </h2>

          {linjer.length === 0 ? (
            <div className="hm-card px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Ingen varer lagt til ennå.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {linjer.map((l) => (
                <li key={l.key} className="hm-card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{pipeLabel(l.name, l.dimension)}</p>
                    {l.pipe_type_id === null ? (
                      <p className="text-xs text-muted-foreground">Skrevet for hånd</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Label htmlFor={`antall-${l.key}`} className="sr-only">
                      Antall {l.name}
                    </Label>
                    <Input
                      id={`antall-${l.key}`}
                      value={l.antalTekst}
                      onChange={(e) => settAntal(l.key, e.target.value)}
                      inputMode="decimal"
                      className="tabular h-11 w-20 text-center text-base"
                    />
                    <span className="w-8 text-sm text-muted-foreground">{l.unit}</span>
                    <button
                      type="button"
                      onClick={() => fjern(l.key)}
                      aria-label={`Fjern ${l.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Kven, når og kvifor ---------- */}
        <section className="hm-card mt-4 space-y-3 p-3" aria-labelledby="om-behovet">
          <h2 id="om-behovet" className="text-sm font-semibold text-foreground">
            Om behovet
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="behov-navn">
              Ditt navn <span className="text-destructive">*</span>
            </Label>
            <Input
              id="behov-navn"
              value={navn}
              onChange={(e) => setNavn(e.target.value)}
              autoComplete="name"
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="behov-dato">Trengs innen</Label>
            <Input
              id="behov-dato"
              type="date"
              value={trengsInnen}
              onChange={(e) => setTrengsInnen(e.target.value)}
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="behov-notat">Melding til kontoret</Label>
            <Textarea
              id="behov-notat"
              value={notat}
              onChange={(e) => setNotat(e.target.value)}
              rows={3}
              placeholder="F.eks. hvor på plassen det skal settes av"
              className="text-base"
            />
          </div>
        </section>

        {/* I vanleg flyt, ikkje fast i botnen: ei fixed-linje kan hamne UNDER
            tastaturet på Android, og då er innsendinga utilgjengeleg til
            brukaren lukkar det. Kassa gjer det same. */}
        <Button
          className="mt-6 h-16 w-full text-base [&_svg]:size-6"
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? (
            <>
              <Loader2 className="mr-2 animate-spin" aria-hidden="true" />
              Melder inn …
            </>
          ) : (
            <>
              <Send className="mr-2" aria-hidden="true" />
              Meld inn {linjer.length > 0 ? `${linjer.length} ${linjer.length === 1 ? "vare" : "varer"}` : "behovet"}
            </>
          )}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Navnet ditt lagres på bestillingen så kontoret vet hvem som meldte behovet.{" "}
          <Link to="/personvern" className="underline underline-offset-2 hover:text-foreground">
            Personvern
          </Link>
        </p>
      </main>
    </div>
  );
}
