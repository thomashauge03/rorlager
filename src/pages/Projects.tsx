// Prosjektlista. Første skjermen ein byggjeplassbrukar møter etter innlogging.
//
// Kontoret ser alle prosjekt her òg, men styrer dei frå adminpanelet – denne
// sida er laga for ein telefon i ei arbeidshanske, ikkje for eit skrivebord.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, FolderOpen, KeyRound, Loader2, LogOut, MapPin, Search, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { QK } from "@/lib/orders";
import { fetchAllProjectOrders, fetchProjects, filtrerProsjekter, isOverdue } from "@/lib/projects";

// Kontoret ser alle prosjektene fra SmartDok her, over 700. Søket tar resten.
const MAKS_VISTE = 100;
import { loggUt, useAuth } from "@/lib/auth";

export default function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth(() => navigate("/login", { replace: true }));

  const projects = useQuery({
    queryKey: QK.projects,
    queryFn: fetchProjects,
    enabled: !auth.checking && !!auth.email,
  });

  // Bestillingane for å kunne seie kva som hastar. RLS gir berre dei
  // prosjekta brukaren er med på, så dette er ei billeg spørjing for plassen.
  const orders = useQuery({
    queryKey: QK.projectOrders,
    queryFn: fetchAllProjectOrders,
    enabled: !auth.checking && !!auth.email,
  });

  /*
   * Null returnerast medan vi ikkje VEIT.
   *
   * Før stod det «Ingenting venter på mottak» på kvart kort så snart spørjinga
   * feila – permanent, og usant. Ei påstand om at ingenting ventar er verre
   * enn inga påstand.
   */
  const status = (projectId: string) => {
    if (!orders.isSuccess) return null;
    const mine = orders.data.filter((o) => o.project_id === projectId);
    return {
      venter: mine.filter((o) => o.status === "bestilt" || o.status === "delvis").length,
      forsinka: mine.filter((o) => isOverdue(o)).length,
    };
  };

  const [søk, setSøk] = useState("");
  const [visAvsluttede, setVisAvsluttede] = useState(false);

  // Et avsluttet prosjekt med varer som fortsatt venter på mottak, skal ikke
  // forsvinne fra plassen før mottakskontrollen er gjort.
  const medÅpneBestillinger = useMemo(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status === "bestilt" || o.status === "delvis")
        .map((o) => o.project_id),
    [orders.data],
  );

  const liste = projects.data ?? [];
  const antallAvsluttede = liste.filter((p) => p.status === "avsluttet").length;
  const treff = useMemo(
    () => filtrerProsjekter(projects.data ?? [], { søk, visAvsluttede, alltidMed: medÅpneBestillinger }),
    [projects.data, søk, visAvsluttede, medÅpneBestillinger],
  );
  const viste = treff.slice(0, MAKS_VISTE);

  const logout = async () => {
    await loggUt(queryClient);
    navigate("/login", { replace: true });
  };

  if (auth.checking) {
    return (
      <div className="hm-page min-h-dvh flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Sjekker innlogging</span>
      </div>
    );
  }

  // Berre eit definitivt nei gir nekting. Har rolla ikkje svart enno, er eit
  // tomt sekund betre enn ei falsk avvising.
  if (auth.roleKnown && auth.role === null) {
    return (
      <div className="hm-page min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
          <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Ingen tilgang</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Du er innlogget som <strong>{auth.email ?? "ukjent"}</strong>, men kontoen er ikke gitt tilgang ennå. En
            administrator må legge deg inn før du ser noe her.
          </p>
        </div>
        <Button variant="outline" onClick={logout}>
          Logg ut
        </Button>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-dvh flex flex-col">
      <TopBar
        title="Prosjekter"
        subtitle={auth.email ?? undefined}
        right={
          <>
          <Button
            variant="ghost"
            onClick={() => navigate("/konto")}
            aria-label="Bytt passord"
            className="h-11 px-2 sm:px-3 text-white hover:bg-white/10 hover:text-white"
          >
            <KeyRound className="h-5 w-5 sm:mr-2" aria-hidden="true" />
            <span className="hidden sm:inline">Bytt passord</span>
          </Button>
          <Button
            variant="ghost"
            onClick={logout}
            // Teksten er display:none på telefon og ikonet er aria-hidden, så
            // utan denne står knappen namnlaus for ein skjermlesar – på nettopp
            // den skjermen som ER mobil.
            aria-label="Logg ut"
            className="h-11 px-2 sm:px-3 text-white hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-5 w-5 sm:mr-2" aria-hidden="true" />
            <span className="hidden sm:inline">Logg ut</span>
          </Button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-10 pt-4 sm:px-4">
        {projects.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : projects.isError ? (
          <div className="hm-card p-6">
            <p className="text-sm font-semibold text-destructive">Prosjektene kunne ikke hentes</p>
            <p className="mt-1 text-sm text-foreground">
              {projects.error instanceof Error ? projects.error.message : "Ukjent feil"}
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => projects.refetch()}>
              Prøv igjen
            </Button>
          </div>
        ) : liste.length === 0 ? (
          <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
            <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
              <FolderOpen className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-1 font-semibold text-foreground">Ingen prosjekter ennå</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Kontoret setter deg på et prosjekt, så dukker det opp her.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Plassen har som regel noen få prosjekter, og trenger ikke et søkefelt
                i veien. Kontoret ser alle fra SmartDok og trenger det. */}
            {liste.length > 8 ? (
              <div className="relative">
                <Label htmlFor="prosjekter-sok" className="sr-only">
                  Søk i prosjektene
                </Label>
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="prosjekter-sok"
                  className="h-12 pl-9"
                  placeholder="Nummer, navn, oppdragsgiver eller adresse"
                  value={søk}
                  onChange={(e) => setSøk(e.target.value)}
                />
              </div>
            ) : null}

            {treff.length === 0 ? (
              <p className="hm-card p-6 text-center text-sm text-muted-foreground">
                {søk.trim()
                  ? "Ingen prosjekter passer søket."
                  : "Ingen aktive prosjekter. De avsluttede finner du under."}
              </p>
            ) : null}

            <ul className="space-y-3">
              {viste.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/prosjekt/${p.id}`)}
                    className="hm-card hm-card-interactive w-full p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{p.name}</p>
                        {p.client ? <p className="truncate text-sm text-muted-foreground">{p.client}</p> : null}
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        {/* Eit avslutta prosjekt såg heilt normalt ut her – det låg
                            berre lenger ned i lista. Då melder nokon inn behov til
                            ein ferdig jobb. */}
                        {p.status === "avsluttet" ? (
                          <span className="hm-chip border border-border bg-muted text-muted-foreground">Avsluttet</span>
                        ) : null}
                        <span className="tabular text-xs text-muted-foreground">#{p.project_number}</span>
                      </span>
                    </div>

                    {p.address ? (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{p.address}</span>
                      </p>
                    ) : null}

                    {/* Tal, ikkje ein statisk frase. «Åpne bestillinger» sa
                        ingenting om kva som hastar, og kunne til og med lesast
                        som ein imperativ. */}
                    {(() => {
                      const s = status(p.id);
                      if (!s) {
                        return (
                          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {orders.isError ? "Fikk ikke hentet bestillingene" : "Henter bestillinger …"}
                          </p>
                        );
                      }
                      const { venter, forsinka } = s;
                      return (
                        <p
                          className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${
                            forsinka > 0 ? "text-warning-ink dark:text-warning" : "text-primary"
                          }`}
                        >
                          {forsinka > 0 ? (
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
                          )}
                          {venter === 0
                            ? "Ingenting venter på mottak"
                            : `${venter} venter på mottak${forsinka > 0 ? ` · ${forsinka} forsinket` : ""}`}
                        </p>
                      );
                    })()}
                  </button>
                </li>
              ))}
            </ul>

            {treff.length > viste.length ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Viser {viste.length} av {treff.length}. Søk for å finne resten.
              </p>
            ) : null}

            {antallAvsluttede > 0 ? (
              <Button variant="outline" className="h-12 w-full" onClick={() => setVisAvsluttede((v) => !v)}>
                {visAvsluttede ? "Skjul avsluttede prosjekter" : `Vis avsluttede prosjekter (${antallAvsluttede})`}
              </Button>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
