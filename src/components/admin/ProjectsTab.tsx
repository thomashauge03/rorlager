// Kontorets prosjektregister: se prosjektene fra SmartDok og sett folk på dem.
//
// Prosjektene opprettes, endres og avsluttes i SmartDok (eller under Prosjekter
// i adminbordet), og synken skriver dem hit hvert kvarter. Her styres bare hvem
// som er på hvert prosjekt, pluss et internt notat.
//
// Tilgangen til et prosjekt styres HER, ikke i brukerregisteret. En person må
// ha en rad i system_users for å komme inn i det hele tatt, og en rad i
// project_members for hvert prosjekt han skal se.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ExternalLink, FolderOpen, Info, Loader2, MapPin, NotebookPen, Search, Trash2, UserPlus, Users } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Stat } from "@/components/Stat";
import { ForbrukEksport, ForbrukPanel } from "@/components/admin/ForbrukPanel";
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import {
  addProjectMember,
  fetchProjectMembers,
  fetchProjects,
  filtrerProsjekter,
  removeProjectMember,
  saveProjectNote,
} from "@/lib/projects";
import type { ProjectMemberRow, ProjectRow } from "@/lib/types";

/** Samme enkle sjekken som brukerregisteret gjør. */
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const ADMINBORDET_PROSJEKTER = "https://hauge-maskin-adminbord.vercel.app/prosjekter";

// Hundrevis av kort med knapper gjør fanen treg når avsluttede er slått på.
// Søket er veien videre, så resten skjules bak en beskjed om å søke.
const MAKS_VISTE = 100;

export function ProjectsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const projects = useQuery({ queryKey: QK.projects, queryFn: fetchProjects });

  const [søk, setSøk] = useState("");
  const [visAvsluttede, setVisAvsluttede] = useState(false);
  const [notatFor, setNotatFor] = useState<ProjectRow | null>(null);
  const [notat, setNotat] = useState("");
  const [medlemmerFor, setMedlemmerFor] = useState<ProjectRow | null>(null);
  const [forbrukFor, setForbrukFor] = useState<ProjectRow | null>(null);

  const åpneNotat = (p: ProjectRow) => {
    setNotatFor(p);
    setNotat(p.note ?? "");
  };

  const lagreNotat = useMutation({
    mutationFn: async () => {
      if (!notatFor) return;
      await saveProjectNote(notatFor.id, notat.trim() || null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projects });
      toast({ title: "Notatet er lagret" });
      setNotatFor(null);
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Notatet ble ikke lagret", description: error.message }),
  });

  const alle = projects.data ?? [];
  const antallAktive = alle.filter((p) => p.status === "aktiv").length;
  const antallAvsluttet = alle.length - antallAktive;

  const treff = useMemo(
    () => filtrerProsjekter(projects.data ?? [], { søk, visAvsluttede }),
    [projects.data, søk, visAvsluttede],
  );
  const viste = treff.slice(0, MAKS_VISTE);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-2 text-sm text-foreground">
          <p>
            Prosjektene hentes fra SmartDok gjennom adminbordet. Nye prosjekter opprettes i SmartDok eller under
            Prosjekter i adminbordet, og dukker opp her innen et kvarter.
          </p>
          <a
            href={ADMINBORDET_PROSJEKTER}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            Åpne Prosjekter i adminbordet
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Stat label="Aktive" value={String(antallAktive)} />
        <Stat label="Avsluttet" value={String(antallAvsluttet)} />
      </div>

      <ForbrukEksport prosjekter={alle} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Label htmlFor="prosjekt-sok" className="sr-only">
            Søk i prosjektene
          </Label>
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="prosjekt-sok"
            className="h-11 pl-9"
            placeholder="Nummer, navn, oppdragsgiver eller adresse"
            value={søk}
            onChange={(e) => setSøk(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <Switch id="prosjekt-avsluttede" checked={visAvsluttede} onCheckedChange={setVisAvsluttede} />
          <Label htmlFor="prosjekt-avsluttede" className="cursor-pointer">
            Vis avsluttede
          </Label>
        </div>
      </div>

      {projects.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : projects.isError ? (
        <div className="hm-card p-6">
          <p className="text-sm font-semibold text-destructive-ink">Prosjektene kunne ikke hentes</p>
          <p className="mt-1 text-sm text-foreground">
            {projects.error instanceof Error ? projects.error.message : "Ukjent feil"}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => projects.refetch()}>
            Prøv igjen
          </Button>
        </div>
      ) : treff.length === 0 ? (
        <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
          <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
            <FolderOpen className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-1 font-semibold text-foreground">
            {alle.length === 0 ? "Ingen prosjekter ennå" : "Ingen prosjekter passer"}
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {alle.length === 0
              ? "Prosjektene dukker opp her når synken fra SmartDok har kjørt."
              : visAvsluttede
                ? "Prøv et annet søk."
                : "Prøv et annet søk, eller slå på «Vis avsluttede»."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {viste.map((p) => (
              <li key={p.id} className="hm-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      <span className="tabular text-muted-foreground">#{p.project_number}</span> {p.name}
                    </p>
                    {p.client ? <p className="truncate text-sm text-muted-foreground">{p.client}</p> : null}
                    {p.address ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{p.address}</span>
                      </p>
                    ) : null}
                    {p.note ? <p className="mt-1 text-sm text-foreground">{p.note}</p> : null}
                  </div>
                  {p.status === "avsluttet" ? (
                    <span className="hm-chip border border-border bg-muted text-muted-foreground">Avsluttet</span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-11" onClick={() => setMedlemmerFor(p)}>
                    <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                    Hvem er på
                  </Button>
                  <Button size="sm" variant="outline" className="h-11" onClick={() => åpneNotat(p)}>
                    <NotebookPen className="mr-2 h-4 w-4" aria-hidden="true" />
                    Notat
                  </Button>
                  <Button size="sm" variant="outline" className="h-11" onClick={() => setForbrukFor(p)}>
                    <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
                    Forbruk
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {treff.length > viste.length ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Viser {viste.length} av {treff.length}. Søk for å finne resten.
            </p>
          ) : null}
        </>
      )}

      {notatFor ? (
        <Dialog open onOpenChange={(o) => !o && setNotatFor(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Notat for {notatFor.name}</DialogTitle>
              <DialogDescription>
                Bare for rørlageret. Navn, oppdragsgiver, adresse og status kommer fra SmartDok og endres der.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="prosjekt-notat">Notat</Label>
              <Textarea id="prosjekt-notat" value={notat} onChange={(e) => setNotat(e.target.value)} rows={3} />
            </div>

            <DialogFooter>
              <Button variant="outline" className="h-12" onClick={() => setNotatFor(null)}>
                Avbryt
              </Button>
              <Button className="h-12" disabled={lagreNotat.isPending} onClick={() => lagreNotat.mutate()}>
                {lagreNotat.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Lagre"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {medlemmerFor ? <MedlemsPanel project={medlemmerFor} onClose={() => setMedlemmerFor(null)} /> : null}
      {forbrukFor ? <ForbrukPanel project={forbrukFor} onClose={() => setForbrukFor(null)} /> : null}
    </div>
  );
}

/** Kven som er på eit prosjekt. Eige panel fordi lista er ei anna spørjing. */
function MedlemsPanel({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [epost, setEpost] = useState("");
  const [skalFjerne, setSkalFjerne] = useState<ProjectMemberRow | null>(null);

  const nøkkel = [...QK.projects, project.id, "medlemmer"];

  const members = useQuery({ queryKey: nøkkel, queryFn: () => fetchProjectMembers(project.id) });

  const legg = useMutation({
    mutationFn: async () => {
      if (!isEmail(epost)) throw new Error("Skriv inn en gyldig e-postadresse.");
      return addProjectMember(project.id, epost);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nøkkel });
      setEpost("");
      toast({ title: "Personen er satt på prosjektet" });
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Personen ble ikke lagt til", description: error.message }),
  });

  const fjern = useMutation({
    mutationFn: async (id: string) => removeProjectMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nøkkel });
      toast({ title: "Personen er fjernet fra prosjektet" });
      setSkalFjerne(null);
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Personen ble ikke fjernet", description: error.message }),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Hvem er på {project.name}</SheetTitle>
        </SheetHeader>

        <p className="mt-2 text-sm text-muted-foreground">
          Personen må også ligge i brukerregisteret med rollen <code className="rounded bg-muted px-1">prosjekt</code>{" "}
          for å komme inn. E-posten kan legges inn før han har registrert seg.
        </p>

        <div className="mt-4 flex gap-2">
          <Label htmlFor="medlem-epost" className="sr-only">
            E-postadresse
          </Label>
          <Input
            id="medlem-epost"
            value={epost}
            onChange={(e) => setEpost(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                legg.mutate();
              }
            }}
            placeholder="navn@firma.no"
            inputMode="email"
            autoComplete="email"
            className="h-11"
          />
          <Button className="h-11 shrink-0" disabled={legg.isPending} onClick={() => legg.mutate()}>
            {legg.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Legg til
              </>
            )}
          </Button>
        </div>

        <div className="mt-4">
          {members.isLoading ? (
            <Skeleton className="h-11 w-full rounded-md" />
          ) : members.isError ? (
            /*
             * Utan denne greina fall ein feila spørjing gjennom til «Ingen er
             * satt på prosjektet ennå» – ei påstand kontoret ville handla på,
             * ved å leggje inn folk som alt var der. Dette er tilgangsstyring;
             * å lyge her er dyrt.
             */
            <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-3">
              <p className="text-sm font-semibold text-destructive-ink">Medlemmene kunne ikke hentes</p>
              <p className="mt-1 text-sm text-foreground">
                {members.error instanceof Error ? members.error.message : "Ukjent feil"}
              </p>
              <Button size="sm" variant="outline" className="mt-2 h-11" onClick={() => members.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : (members.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ingen er satt på prosjektet ennå.</p>
          ) : (
            <ul className="space-y-2">
              {(members.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <span className="min-w-0 truncate text-sm">{m.email}</span>
                  <button
                    type="button"
                    disabled={fjern.isPending}
                    onClick={() => setSkalFjerne(m)}
                    aria-label={`Fjern ${m.email} fra prosjektet`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive-ink disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ett trykk tok tidligere fra en person tilgangen til prosjektet,
            og det er for tungt til å skje uten en bekreftelse. */}
        <AlertDialog open={!!skalFjerne} onOpenChange={(o) => !o && setSkalFjerne(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fjerne {skalFjerne?.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                Personen mister tilgangen til {project.name} med det samme, og ser ikke lenger bestillingene eller
                mottakene på prosjektet.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  if (skalFjerne) fjern.mutate(skalFjerne.id);
                }}
              >
                Fjern
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
