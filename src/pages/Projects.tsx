// Prosjektlista. Første skjermen ein byggjeplassbrukar møter etter innlogging.
//
// Kontoret ser alle prosjekt her òg, men styrer dei frå adminpanelet – denne
// sida er laga for ein telefon i ei arbeidshanske, ikkje for eit skrivebord.

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, FolderOpen, Loader2, LogOut, MapPin, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { QK } from "@/lib/orders";
import { fetchAllProjectOrders, fetchProjects, isOverdue } from "@/lib/projects";
import { useAuth } from "@/lib/auth";

export default function Projects() {
  const navigate = useNavigate();
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

  const status = (projectId: string) => {
    const mine = (orders.data ?? []).filter((o) => o.project_id === projectId);
    return {
      venter: mine.filter((o) => o.status === "bestilt" || o.status === "delvis").length,
      forsinka: mine.filter((o) => isOverdue(o)).length,
    };
  };

  const logout = async () => {
    await supabase.auth.signOut();
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

  const liste = projects.data ?? [];

  return (
    <div className="hm-page min-h-dvh flex flex-col">
      <TopBar
        title="Prosjekter"
        subtitle={auth.email ?? undefined}
        right={
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
          <ul className="space-y-3">
            {liste.map((p) => (
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
                    <span className="tabular shrink-0 text-xs text-muted-foreground">#{p.project_number}</span>
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
                    const { venter, forsinka } = status(p.id);
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
        )}
      </main>
    </div>
  );
}
