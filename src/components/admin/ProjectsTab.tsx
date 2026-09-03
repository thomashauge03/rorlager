// Kontorets prosjektregister: opprett prosjekt og sett folk på dei.
//
// Tilgangen til eit prosjekt blir styrt HER, ikkje i brukarregisteret. Ein
// person må ha ei rad i system_users for å kome inn i det heile, og ei rad i
// project_members for kvart prosjekt han skal sjå.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Loader2, MapPin, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Stat } from "@/components/Stat";
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import {
  addProjectMember,
  deleteProject,
  fetchProjectMembers,
  fetchProjects,
  removeProjectMember,
  saveProject,
} from "@/lib/projects";
import type { ProjectMemberRow, ProjectRow } from "@/lib/types";

/** Same enkle sjekken som brukarregisteret gjer. */
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

type Utkast = { name: string; client: string; address: string; status: ProjectRow["status"]; note: string };

const TOMT: Utkast = { name: "", client: "", address: "", status: "aktiv", note: "" };

const fraRad = (p: ProjectRow): Utkast => ({
  name: p.name,
  client: p.client ?? "",
  address: p.address ?? "",
  status: p.status,
  note: p.note ?? "",
});

export function ProjectsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const projects = useQuery({ queryKey: QK.projects, queryFn: fetchProjects });

  const [redigerer, setRedigerer] = useState<ProjectRow | "ny" | null>(null);
  const [utkast, setUtkast] = useState<Utkast>(TOMT);
  const [medlemmerFor, setMedlemmerFor] = useState<ProjectRow | null>(null);
  const [skalSlette, setSkalSlette] = useState<ProjectRow | null>(null);

  const åpne = (p: ProjectRow | "ny") => {
    setRedigerer(p);
    setUtkast(p === "ny" ? TOMT : fraRad(p));
  };

  const lagre = useMutation({
    mutationFn: async () => {
      if (!utkast.name.trim()) throw new Error("Prosjektet må ha et navn.");
      return saveProject({
        id: redigerer && redigerer !== "ny" ? redigerer.id : undefined,
        name: utkast.name.trim(),
        client: utkast.client.trim() || null,
        address: utkast.address.trim() || null,
        status: utkast.status,
        note: utkast.note.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projects });
      toast({ title: "Prosjektet er lagret" });
      setRedigerer(null);
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Prosjektet ble ikke lagret", description: error.message }),
  });

  const slett = useMutation({
    mutationFn: async (p: ProjectRow) => deleteProject(p.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projects });
      queryClient.invalidateQueries({ queryKey: QK.projectOrders });
      toast({ title: "Prosjektet er slettet" });
      setSkalSlette(null);
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Prosjektet ble ikke slettet", description: error.message }),
  });

  const liste = projects.data ?? [];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Stat label="Aktive" value={String(liste.filter((p) => p.status === "aktiv").length)} />
          <Stat label="Avsluttet" value={String(liste.filter((p) => p.status === "avsluttet").length)} />
        </div>
        <Button className="h-11" onClick={() => åpne("ny")}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nytt prosjekt
        </Button>
      </div>

      {projects.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
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
            Opprett et prosjekt, og sett folkene på plassen på det.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {liste.map((p) => (
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
                <Button size="sm" variant="outline" className="h-11" onClick={() => åpne(p)}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  Endre
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 text-muted-foreground hover:text-destructive"
                  onClick={() => setSkalSlette(p)}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Slett
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Opprett og endre ---------- */}
      {redigerer ? (
        <Dialog open onOpenChange={(o) => !o && setRedigerer(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{redigerer === "ny" ? "Nytt prosjekt" : "Endre prosjekt"}</DialogTitle>
              <DialogDescription>
                Adressen er den varene skal kjøres til, og den kontoret oppgir hos leverandøren.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="prosjekt-navn">
                  Navn <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="prosjekt-navn"
                  value={utkast.name}
                  onChange={(e) => setUtkast((f) => ({ ...f, name: e.target.value }))}
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prosjekt-kunde">Oppdragsgiver</Label>
                <Input
                  id="prosjekt-kunde"
                  value={utkast.client}
                  onChange={(e) => setUtkast((f) => ({ ...f, client: e.target.value }))}
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prosjekt-adresse">Leveringsadresse</Label>
                <Input
                  id="prosjekt-adresse"
                  value={utkast.address}
                  onChange={(e) => setUtkast((f) => ({ ...f, address: e.target.value }))}
                  className="h-12"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prosjekt-status">Status</Label>
                <Select
                  value={utkast.status}
                  onValueChange={(v) => setUtkast((f) => ({ ...f, status: v as ProjectRow["status"] }))}
                >
                  <SelectTrigger id="prosjekt-status" className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="avsluttet">Avsluttet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prosjekt-notat">Notat</Label>
                <Textarea
                  id="prosjekt-notat"
                  value={utkast.note}
                  onChange={(e) => setUtkast((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="h-12" onClick={() => setRedigerer(null)}>
                Avbryt
              </Button>
              <Button className="h-12" disabled={lagre.isPending} onClick={() => lagre.mutate()}>
                {lagre.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Lagre"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {medlemmerFor ? <MedlemsPanel project={medlemmerFor} onClose={() => setMedlemmerFor(null)} /> : null}

      <AlertDialog open={!!skalSlette} onOpenChange={(o) => !o && setSkalSlette(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{skalSlette?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle bestillinger og mottak på prosjektet blir slettet med det. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => skalSlette && slett.mutate(skalSlette)}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              <p className="text-sm font-semibold text-destructive">Medlemmene kunne ikke hentes</p>
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Eitt trykk tok tidlegare frå ein person tilgangen til prosjektet.
            Same vekt som å slette eit prosjekt, og difor same bekreftelse. */}
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
