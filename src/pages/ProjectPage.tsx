// Eitt prosjekt: bestillingane på det, og vegen vidare til å melde behov eller
// kvittere for eit mottak.

import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, FileDown, Loader2, MapPin, PackageCheck, Plus, Truck, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { Stat } from "@/components/Stat";
import { ProjectStatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import { deleteProjectOrder, fetchProject, fetchProjectOrders, isOverdue } from "@/lib/projects";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { downloadReceiptPDFMedBilder } from "@/lib/receipt-pdf";
import { num, shortDate } from "@/lib/format";
import { useState } from "react";
import type { ProjectOrderWithLines } from "@/lib/types";

/** Kor mange av dei bestilte linjene som er fullt mottatt. */
function framdrift(order: ProjectOrderWithLines) {
  const bestilte = order.lines.filter((l) => Number(l.ordered_qty ?? 0) > 0);
  const ferdige = bestilte.filter((l) => l.received_qty >= Number(l.ordered_qty));
  return { ferdige: ferdige.length, totalt: bestilte.length };
}

export default function ProjectPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth(() => navigate("/login", { replace: true }));
  const klar = !auth.checking && !!auth.email;

  const [skalTrekke, setSkalTrekke] = useState<ProjectOrderWithLines | null>(null);
  const { data: settings } = useSettings();

  const project = useQuery({
    queryKey: [...QK.projects, id],
    queryFn: () => fetchProject(id),
    enabled: klar && !!id,
  });

  const orders = useQuery({
    queryKey: [...QK.projectOrders, id],
    queryFn: () => fetchProjectOrders(id),
    enabled: klar && !!id,
  });

  const trekkTilbake = useMutation({
    mutationFn: async (o: ProjectOrderWithLines) => deleteProjectOrder(o.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projectOrders });
      toast({ title: "Behovet er trukket tilbake" });
      setSkalTrekke(null);
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Behovet ble ikke trukket tilbake", description: error.message }),
  });

  if (auth.checking) {
    return (
      <div className="hm-page min-h-dvh flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Sjekker innlogging</span>
      </div>
    );
  }

  const p = project.data;

  /*
   * Finst ikkje prosjektet, seier vi det.
   *
   * Tidlegare fall dette gjennom til «Ingen bestillinger ennå» – ein påstand
   * som ikkje var sann, og som fekk folk til å melde inn behovet på nytt.
   */
  if (project.isError || (project.isSuccess && !p)) {
    return (
      <div className="hm-page min-h-dvh">
        <TopBar title="Prosjekt" back="/prosjekt" />
        <main className="mx-auto w-full max-w-3xl px-3 pt-4 sm:px-4">
          <div className="hm-card p-6">
            <p className="font-semibold text-foreground">Fant ikke prosjektet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Det kan være fjernet, eller du er ikke satt på det lenger. Sjekk at du har dekning, og prøv igjen.
            </p>
            {project.error instanceof Error ? (
              <p className="mt-2 text-xs text-muted-foreground">{project.error.message}</p>
            ) : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="h-12 flex-1" onClick={() => project.refetch()}>
                Prøv igjen
              </Button>
              <Button className="h-12 flex-1" onClick={() => navigate("/prosjekt")}>
                Til prosjektlista
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const liste = orders.data ?? [];

  return (
    <div className="hm-page min-h-dvh flex flex-col">
      <TopBar title={p?.name ?? "Prosjekt"} subtitle={p?.client ?? undefined} back="/prosjekt" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-10 pt-4 sm:px-4">
        {p?.address ? (
          <p className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{p.address}</span>
          </p>
        ) : null}

        <Button className="h-14 w-full text-base [&_svg]:size-6" onClick={() => navigate(`/prosjekt/${id}/behov`)}>
          <Plus className="mr-2" aria-hidden="true" />
          Meld inn behov
        </Button>

        <div className="mt-5">
          {orders.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <span className="sr-only">Henter bestillingene</span>
            </div>
          ) : orders.isError ? (
            <div className="hm-card p-6">
              <p className="font-semibold text-foreground">Bestillingene kunne ikke hentes</p>
              <p className="mt-1 text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
              {orders.error instanceof Error ? (
                <p className="mt-2 text-xs text-muted-foreground">{orders.error.message}</p>
              ) : null}
              <Button variant="outline" className="mt-3 h-12 w-full" onClick={() => orders.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : liste.length === 0 ? (
            <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
              <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
                <ClipboardList className="h-7 w-7 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-1 font-semibold text-foreground">Ingen bestillinger ennå</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Meld inn hva dere trenger, så tar kontoret det videre til leverandøren.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {liste.map((o) => {
                const { ferdige, totalt } = framdrift(o);
                const forsinka = isOverdue(o);
                const kanKvittere = o.status === "bestilt" || o.status === "delvis";
                // Kva som står ute er den viktigaste informasjonen på kortet, og
                // det gjeld frå bestillinga er lagt inn – ikkje berre når noko
                // alt er kome.
                const visLinjer = o.status === "bestilt" || o.status === "delvis";

                return (
                  <li key={o.id} className="hm-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tabular font-semibold text-foreground">Bestilling #{o.order_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {o.requested_by_name ? `Meldt av ${o.requested_by_name} · ` : ""}
                          {shortDate(o.created_at)}
                        </p>
                      </div>
                      <ProjectStatusBadge status={o.status} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Stat label="Varelinjer" value={String(o.lines.length)} />
                      {totalt > 0 ? <Stat label="Mottatt" value={`${ferdige} av ${totalt}`} /> : null}
                      {o.expected_at ? <Stat label="Ventes" value={shortDate(o.expected_at)} /> : null}
                    </div>

                    {forsinka ? (
                      <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-warning-ink dark:text-warning">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Skulle vært levert {shortDate(o.expected_at)}
                      </p>
                    ) : null}

                    {o.supplier ? (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {o.supplier}
                        {o.supplier_ref ? ` · ${o.supplier_ref}` : ""}
                      </p>
                    ) : null}

                    {/* Det kontoret skriv skal lesast av nokon. Utan dette ville
                        «kommer i to puljer» blitt liggjande usett i basen. */}
                    {o.office_note ? (
                      <p className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
                        <span className="font-medium">Fra kontoret:</span> {o.office_note}
                      </p>
                    ) : null}

                    {visLinjer ? (
                      <ul className="mt-3 space-y-1 border-t border-border pt-3">
                        {o.lines
                          .filter((l) => Number(l.ordered_qty ?? 0) > 0)
                          .map((l) => (
                            <li key={l.id} className="flex justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate text-muted-foreground">{l.name}</span>
                              <span className="tabular shrink-0 font-medium text-foreground">
                                {l.remaining_qty > 0
                                  ? `mangler ${num(l.remaining_qty)} ${l.unit}`
                                  : `${num(Number(l.ordered_qty))} ${l.unit} mottatt`}
                              </span>
                            </li>
                          ))}
                      </ul>
                    ) : null}

                    {/* Kvitteringane. Etter innsending låg dei berre i basen, og
                        ingen kunne sjå kven som tok imot kva. */}
                    {o.receipts.length > 0 ? (
                      <ul className="mt-3 space-y-1 border-t border-border pt-3">
                        {o.receipts.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                            <span className="min-w-0 truncate">
                              Mottak #{r.receipt_number} · {r.received_by_name}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="tabular">{shortDate(r.received_at)}</span>
                              {/* Utskrifta er det du sender leverandøren ved
                                  reklamasjon. Utan denne låg kvitteringa berre
                                  i basen. */}
                              <button
                                type="button"
                                aria-label={`Last ned mottak ${r.receipt_number} som PDF`}
                                onClick={() =>
                                  downloadReceiptPDFMedBilder({
                                    company: {
                                      name: settings?.company_name || "Hauge Maskin AS",
                                      orgNumber: settings?.org_number ?? null,
                                      address: settings?.address ?? null,
                                      phone: settings?.phone ?? null,
                                      email: settings?.email ?? null,
                                    },
                                    projectName: p?.name ?? "Prosjekt",
                                    projectAddress: p?.address ?? null,
                                    order: o,
                                    receipt: r,
                                    photoPaths: r.photos.map((f) => f.path),
                                  })
                                }
                                className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <FileDown className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {kanKvittere ? (
                      <Button
                        className="mt-4 h-12 w-full [&_svg]:size-5"
                        onClick={() => navigate(`/prosjekt/${id}/mottak/${o.id}`)}
                      >
                        <PackageCheck className="mr-2" aria-hidden="true" />
                        Kvitter for mottak
                      </Button>
                    ) : null}

                    {/* Har du meldt inn feil, skal du slippe å ringe kontoret.
                        Etter at det er bestilt er det derimot for seint. */}
                    {o.status === "meldt" ? (
                      <Button
                        variant="ghost"
                        className="mt-2 h-11 w-full text-muted-foreground"
                        onClick={() => setSkalTrekke(o)}
                      >
                        <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Trekk tilbake
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <AlertDialog open={!!skalTrekke} onOpenChange={(o) => !o && setSkalTrekke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trekke tilbake bestilling #{skalTrekke?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Behovet forsvinner fra kontorets liste, og varene blir ikke bestilt. Du må melde inn på nytt hvis du
              ombestemmer deg.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={trekkTilbake.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (skalTrekke) trekkTilbake.mutate(skalTrekke);
              }}
            >
              {trekkTilbake.isPending ? "Trekker tilbake …" : "Trekk tilbake"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
