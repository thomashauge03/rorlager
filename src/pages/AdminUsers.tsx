import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { SystemUserRow } from "@/integrations/supabase/types";
import { TopBar } from "@/components/TopBar";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, FolderKanban, Info, KeyRound, Loader2, Pencil, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { shortDate } from "@/lib/format";
import { opprettBruker, type OpprettSvar } from "@/lib/brukere";
import { fetchMemberProjects, fetchProjects, setMemberProjects } from "@/lib/projects";
import type { ProjectRow } from "@/lib/types";

const ROLES = [
  { value: "admin", label: "Admin", hjelp: "Hele adminpanelet" },
  { value: "kontor", label: "Kontor", hjelp: "Hele adminpanelet" },
  { value: "lager", label: "Lager", hjelp: "Hele adminpanelet" },
  {
    value: "prosjekt",
    label: "Prosjekt",
    hjelp: "Bare prosjektene han settes på. Ikke lager, priser eller faktura.",
  },
];

const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

/** Rolla som ikkje ser admindelen. Alt anna er kontor. */
const PROSJEKT = "prosjekt";

type Draft = { email: string; full_name: string; role: string; note: string; projectIds: string[] };

const EMPTY_DRAFT: Draft = { email: "", full_name: "", role: "admin", note: "", projectIds: [] };

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function AdminUsers() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  /** Oppslaget kom aldri fram. Ikkje det same som eit nei – sjå render under. */
  const [sjekkFeila, setSjekkFeila] = useState(false);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [registryReady, setRegistryReady] = useState(true);
  // Meldinga frå Supabase er ofte det einaste som skil ein manglande migrasjon
  // frå nettverk, utgått økt eller manglande tilgang
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<SystemUserRow[]>([]);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<SystemUserRow | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [toDelete, setToDelete] = useState<SystemUserRow | null>(null);

  /** Passordet blir vist éin gong. Det finst ingen stad å hente det frå etterpå. */
  const [nyttPassord, setNyttPassord] = useState<(OpprettSvar & { email: string }) | null>(null);
  const [skalNullstille, setSkalNullstille] = useState<SystemUserRow | null>(null);
  const [prosjekt, setProsjekt] = useState<ProjectRow[]>([]);

  /*
   * KVA STATUS PROSJEKTLISTA I DIALOGEN HAR.
   *
   * Dette er ikkje pynt. Lagring skriv skilnaden mellom det som står i basen og
   * det som er avkryssa – og skilnaden frå ei TOM liste er å fjerne alt. Rakk
   * ikkje hentinga fram, eller feila ho, ville eit trykk på Lagre teke frå
   * personen kvart prosjekt han hadde, utan at noko såg gale ut: ruta viste
   * «0 valgt», og toasten sa «Brukeren er oppdatert».
   *
   * Difor blir Lagre stengd til lista faktisk er lesen.
   */
  const [prosjektStatus, setProsjektStatus] = useState<"laster" | "klar" | "feil">("klar");

  // Prosjektlista trengst både i opprettingsskjemaet og i redigeringsdialogen.
  /*
   * Statusen følgjer med, òg for opprettingsskjemaet.
   *
   * Feila hentinga før, blei ho svelgd, og ProsjektVelger sto med tom liste og
   * teksten «Ingen prosjekter opprettet ennå» – til ein superadmin som laga eit
   * prosjekt to minutt tidlegare. Valde han rolla Prosjekt, stoppa vakta han
   * med «Velg minst ett prosjekt», eit krav han ikkje kunne oppfylle.
   */
  const [prosjektListeStatus, setProsjektListeStatus] = useState<"laster" | "klar" | "feil">("laster");

  const hentProsjekt = useCallback(() => {
    setProsjektListeStatus("laster");
    fetchProjects()
      .then((p) => {
        setProsjekt(p);
        setProsjektListeStatus("klar");
      })
      .catch(() => setProsjektListeStatus("feil"));
  }, []);

  useEffect(() => {
    if (allowed) hentProsjekt();
  }, [allowed, hentProsjekt]);

  /*
   * Hentar prosjekta til den som blir redigert.
   *
   * Nøkla på editing.id, ikkje på e-posten: e-postfeltet er redigerbart, så ei
   * vakt bygd på det ville slege feil i det superadmin retta adressa – og då
   * blei lista ståande tom, med sletting av alt som resultat.
   *
   * avbrutt-flagget hindrar at eit seint svar frå ein tidlegare bruker landar i
   * ein nyare dialog.
   */
  useEffect(() => {
    if (!editing) return;
    let avbrutt = false;
    setProsjektStatus("laster");

    fetchMemberProjects(editing.email)
      .then((ids) => {
        if (avbrutt) return;
        setEditDraft((d) => ({ ...d, projectIds: ids }));
        setProsjektStatus("klar");
      })
      .catch(() => {
        if (!avbrutt) setProsjektStatus("feil");
      });

    return () => {
      avbrutt = true;
    };
  }, [editing]);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("system_users")
      .select("id, created_at, email, full_name, role, note, created_by")
      .order("created_at", { ascending: false });
    setLoadingUsers(false);
    if (error) {
      setRegistryReady(false);
      setRegistryError(error.message || null);
      return;
    }
    setRegistryReady(true);
    setRegistryError(null);
    setUsers((data ?? []) as SystemUserRow[]);
  }, []);

  const sjekkTilgang = useCallback(async () => {
    setChecking(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    setMyEmail(user.email ?? null);

    /*
     * EIT FEILA OPPSLAG ER IKKJE EIT NEI.
     *
     * Her stod `const ok = !error && data === true`, og eit nettverksglipp,
     * ein utgått token eller ein hikke i PostgREST kolla då ned til det same
     * som «du er ikkje superadmin» – med ei forklaring som var handfast og
     * usann: «sjekk at e-posten din står i super_admins». Ein superadmin på
     * eit nettbrett med dårleg dekning fekk beskjed om at tilgangen var borte,
     * og ingen veg vidare enn «Tilbake».
     *
     * Adminpanelet skil desse to alt; denne skjermen gjorde det ikkje.
     * Tilgangen blir uansett avgjord av RLS i databasen – dette styrer berre
     * kva grensesnittet viser.
     */
    const { data, error } = await supabase.rpc("is_super_admin", {});
    setSjekkFeila(!!error);
    const ok = !error && data === true;
    setAllowed(ok);
    setChecking(false);
    if (ok) fetchUsers();
  }, [navigate, fetchUsers]);

  useEffect(() => {
    void sjekkTilgang();
  }, [sjekkTilgang]);

  /**
   * Oppretter innlogging, registerrad og prosjekttilgang i ett.
   *
   * Går gjennom serverfunksjonen, ikke rett på tabellen: å lage en innlogging
   * krever service_role, som aldri kan ligge i nettleseren. Passordet kommer
   * tilbake én gang og blir vist til superadmin — det lagres ingen steder.
   */
  const addUser = async () => {
    const email = draft.email.trim().toLowerCase();
    if (!isEmail(email)) {
      toast({ title: "Ugyldig e-post", description: "Skriv en gyldig e-postadresse.", variant: "destructive" });
      return;
    }
    if (draft.role === PROSJEKT && draft.projectIds.length === 0) {
      toast({
        title: "Velg minst ett prosjekt",
        description: "En prosjektbruker uten prosjekt ser ingenting når han logger inn.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const svar = await opprettBruker({
        email,
        full_name: draft.full_name.trim() || null,
        role: draft.role,
        note: draft.note.trim() || null,
        projectIds: draft.projectIds,
      });
      setNyttPassord({ email, ...svar });
      setDraft(EMPTY_DRAFT);
      fetchUsers();
      if (svar.warning) toast({ variant: "destructive", title: "Delvis fullført", description: svar.warning });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Klarte ikke å opprette brukeren",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Nytt eingongspassord til ein som alt finst. Same funksjon, same vakt.
   *
   * barePassord: registerrada og prosjekta blir IKKJE rørte. Sende vi med rolla
   * slik ho låg i lista her, ville eit passordbyte rulla tilbake ei
   * rolleendring nokon annan gjorde for fem minutt sidan.
   */
  const nyttPassordTil = async (user: SystemUserRow) => {
    setSaving(true);
    try {
      const svar = await opprettBruker({
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        note: user.note,
        projectIds: [],
        barePassord: true,
      });
      setNyttPassord({ email: user.email, ...svar });
      // Lista kan ha endra seg medan dialogen sto open
      fetchUsers();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Klarte ikke å lage nytt passord",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
      setSkalNullstille(null);
    }
  };

  const openEdit = (user: SystemUserRow) => {
    setEditing(user);
    setProsjektStatus("laster");
    setEditDraft({
      email: user.email,
      full_name: user.full_name ?? "",
      role: user.role,
      note: user.note ?? "",
      projectIds: [],
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const email = editDraft.email.trim().toLowerCase();
    if (!isEmail(email)) {
      toast({ title: "Ugyldig e-post", description: "Skriv en gyldig e-postadresse.", variant: "destructive" });
      return;
    }

    // Same vakt som ved oppretting: ein prosjektbrukar utan prosjekt ser
    // ingenting når han loggar inn.
    if (editDraft.role === PROSJEKT && editDraft.projectIds.length === 0) {
      toast({
        title: "Velg minst ett prosjekt",
        description: "En prosjektbruker uten prosjekt ser ingenting når han logger inn.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("system_users")
      .update({
        email,
        full_name: editDraft.full_name.trim() || null,
        role: editDraft.role,
        note: editDraft.note.trim() || null,
      })
      .eq("id", editing.id);

    if (error) {
      setSaving(false);
      toast({ title: "Klarte ikke å lagre endringen", description: "Prøv igjen.", variant: "destructive" });
      return;
    }

    // Prosjekttilgangen ligg i ein annan tabell, og blir skriven som skilnaden
    // mot det som alt står der.
    try {
      await setMemberProjects(email, editDraft.projectIds);
    } catch (err) {
      setSaving(false);
      toast({
        variant: "destructive",
        title: "Brukeren er lagret, men prosjekttilgangen er ikke det",
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }

    setSaving(false);
    toast({ title: "Brukeren er oppdatert" });
    setEditing(null);
    fetchUsers();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("system_users").delete().eq("id", toDelete.id);
    setToDelete(null);
    if (error) {
      toast({ title: "Klarte ikke å fjerne brukeren", description: "Prøv igjen.", variant: "destructive" });
      return;
    }
    toast({
      title: "Fjernet fra registeret",
      description: "Selve påloggingen må slettes i Supabase.",
    });
    fetchUsers();
  };

  if (checking) {
    return (
      <div className="min-h-dvh hm-page flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Laster" />
      </div>
    );
  }

  if (sjekkFeila) {
    return (
      <div className="min-h-dvh hm-page flex items-center justify-center p-4">
        <Card className="max-w-sm w-full animate-fade-in">
          <CardContent className="pt-6 text-center space-y-3">
            <div className="mx-auto rounded-full bg-muted p-3 w-fit">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground">Fikk ikke sjekket tilgangen din</p>
            <p className="text-sm text-muted-foreground">
              Serveren svarte ikke. Dette betyr ikke at tilgangen er borte — sjekk nettet og prøv igjen.
            </p>
            <Button className="h-11 w-full" onClick={() => void sjekkTilgang()}>
              Prøv igjen
            </Button>
            <Button variant="outline" className="h-11 w-full" onClick={() => navigate("/admin")}>
              Tilbake til adminpanelet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-dvh hm-page flex items-center justify-center p-4">
        <Card className="max-w-sm w-full animate-fade-in">
          <CardContent className="pt-6 text-center space-y-3">
            <div className="mx-auto rounded-full bg-destructive/10 p-3 w-fit">
              <ShieldCheck className="h-6 w-6 text-destructive" aria-hidden="true" />
            </div>
            <p className="font-semibold text-foreground">Du har ikke tilgang</p>
            <p className="text-sm text-muted-foreground">
              Brukeradministrasjon er forbeholdt superadmin. Er dette din side, sjekk at e-posten du er logget inn med
              står i tabellen <code className="text-xs">super_admins</code>.
            </p>
            <Button variant="outline" className="h-11 w-full" onClick={() => navigate("/admin")}>
              Tilbake til adminpanelet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh hm-page flex flex-col">
      <TopBar title="Brukere" subtitle="Superadmin" back="/admin" />

      <main className="w-full max-w-4xl mx-auto p-4 space-y-4 flex-1 animate-fade-in">
        {!registryReady && (
          <div className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2.5 space-y-1">
            <p className="text-sm text-warning-ink">
              Fikk ikke lest tabellen <code className="text-xs">system_users</code>. Det kan være nettverket,
              en utløpt pålogging, manglende tilgang – eller at migrasjonen{" "}
              <code className="text-xs">supabase/migrations/20260810100100_rorlager_admins.sql</code> ikke er kjørt.
            </p>
            {registryError && <p className="text-sm text-foreground">{registryError}</p>}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5 flex gap-2.5">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            «Opprett med midlertidig passord» lager{" "}
            <span className="font-medium text-foreground">både påloggingen og tilgangen</span> — du trenger ikke innom
            Supabase. Passordet vises én gang; personen logger inn med det og bytter det selv nederst på denne siden.
            Rollen avgjør hva han ser, og avkryssingene hvilke prosjekter.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
              Legg til bruker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-user-email">E-post</Label>
                <Input
                  id="new-user-email"
                  className="h-11"
                  type="email"
                  inputMode="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  placeholder="navn@haugemaskin.no"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-name">Navn</Label>
                <Input
                  id="new-user-name"
                  className="h-11"
                  autoComplete="off"
                  placeholder="Fornavn Etternavn"
                  value={draft.full_name}
                  onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-role">Rolle</Label>
                <Select value={draft.role} onValueChange={(v) => setDraft((d) => ({ ...d, role: v }))}>
                  <SelectTrigger id="new-user-role" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ROLES.find((r) => r.value === draft.role)?.hjelp}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-note">Notat</Label>
                <Input
                  id="new-user-note"
                  className="h-11"
                  autoComplete="off"
                  placeholder="Valgfritt"
                  value={draft.note}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </div>
            </div>

            <ProsjektVelger
              idPrefiks="ny"
              alle={prosjekt}
              valgte={draft.projectIds}
              onEndre={(ids) => setDraft((d) => ({ ...d, projectIds: ids }))}
              paakrevd={draft.role === PROSJEKT}
              status={prosjektListeStatus}
              onPrøvIgjen={hentProsjekt}
            />

            <Button className="h-11 w-full sm:w-auto" onClick={addUser} disabled={saving || !draft.email.trim()}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Oppretter …
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  Opprett med midlertidig passord
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              Registrerte brukere <span className="tabular text-muted-foreground">({users.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Laster brukere" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Ingen brukere er registrert ennå.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email} · {roleLabel(u.role)}
                        {u.note ? ` · ${u.note}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground tabular hidden sm:inline mr-1">
                        {shortDate(u.created_at)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11"
                        aria-label={`Nytt midlertidig passord til ${u.email}`}
                        onClick={() => setSkalNullstille(u)}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11"
                        aria-label={`Rediger ${u.email}`}
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11"
                        aria-label={`Fjern ${u.email} fra registeret`}
                        onClick={() => setToDelete(u)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Ditt passord
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Endrer passordet til {myEmail ?? "den innloggede brukeren"}.
            </p>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm email={myEmail} />
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rediger bruker</DialogTitle>
            <DialogDescription>
              Endringene gjelder bare registeret. Bytter du e-post her, må den også byttes i Supabase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-email">E-post</Label>
              <Input
                id="edit-user-email"
                className="h-11"
                type="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={editDraft.email}
                onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-name">Navn</Label>
              <Input
                id="edit-user-name"
                className="h-11"
                value={editDraft.full_name}
                onChange={(e) => setEditDraft((d) => ({ ...d, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-role">Rolle</Label>
              <Select value={editDraft.role} onValueChange={(v) => setEditDraft((d) => ({ ...d, role: v }))}>
                <SelectTrigger id="edit-user-role" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === editDraft.role)?.hjelp}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-user-note">Notat</Label>
              <Textarea
                id="edit-user-note"
                rows={2}
                value={editDraft.note}
                onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </div>

            <ProsjektVelger
              idPrefiks="rediger"
              alle={prosjekt}
              valgte={editDraft.projectIds}
              onEndre={(ids) => setEditDraft((d) => ({ ...d, projectIds: ids }))}
              paakrevd={editDraft.role === PROSJEKT}
              status={prosjektStatus}
              onPrøvIgjen={() => editing && openEdit(editing)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="h-11" onClick={() => setEditing(null)}>
              Avbryt
            </Button>
            {/* Stengd til prosjektlista er lesen: lagring skriv skilnaden, og
                skilnaden frå ei uferdig liste er å fjerne alt. */}
            <Button className="h-11" onClick={saveEdit} disabled={saving || prosjektStatus !== "klar"}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Lagrer …
                </>
              ) : prosjektStatus === "laster" ? (
                "Henter tilgangen …"
              ) : (
                "Lagre"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjerne fra registeret?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.email} blir borte fra listen. Påloggingen består til den blir slettet i Supabase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Avbryt</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Fjern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!skalNullstille} onOpenChange={(open) => !open && setSkalNullstille(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nytt midlertidig passord?</AlertDialogTitle>
            <AlertDialogDescription>
              Det gamle passordet til {skalNullstille?.email} slutter å virke med det samme, og pågående økter blir
              stående til de utløper. Du får det nye vist én gang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                if (skalNullstille) nyttPassordTil(skalNullstille);
              }}
            >
              {saving ? "Lager …" : "Lag nytt passord"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {nyttPassord ? <PassordDialog data={nyttPassord} onClose={() => setNyttPassord(null)} /> : null}
    </div>
  );
}

/**
 * Kva prosjekt ein person skal sjå.
 *
 * Fleire per person med vilje: folk blir flytta mellom plassar frå veke til
 * veke, og då skal det vere eitt hakk å setje, ikkje ei ny oppføring.
 *
 * Same tilgangen kan òg styrast frå prosjektsida (Admin -> Prosjekt -> «Hvem er
 * på»). Begge skriv same tabellen; dette er berre den andre vegen inn, for når
 * du har personen framfor deg og ikkje plassen.
 */
function ProsjektVelger({
  idPrefiks,
  alle,
  valgte,
  onEndre,
  paakrevd,
  status = "klar",
  onPrøvIgjen,
}: {
  idPrefiks: string;
  alle: ProjectRow[];
  valgte: string[];
  onEndre: (ids: string[]) => void;
  paakrevd: boolean;
  status?: "laster" | "klar" | "feil";
  onPrøvIgjen?: () => void;
}) {
  const veksle = (id: string) =>
    onEndre(valgte.includes(id) ? valgte.filter((x) => x !== id) : [...valgte, id]);

  // Ei feila henting skal SYNAST. Blei ho svelgd, ville lista sett ut som ei
  // sanning – og ei tom sanning her betyr «fjern alt» ved lagring.
  if (status === "feil") {
    return (
      <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-3">
        <p className="text-sm font-semibold text-destructive">Prosjekttilgangen kunne ikke hentes</p>
        <p className="mt-1 text-sm text-foreground">
          Lagring er stengt til den er lest — ellers ville et trykk på Lagre fjernet alle prosjektene hans.
        </p>
        {onPrøvIgjen ? (
          <Button size="sm" variant="outline" className="mt-2 h-11" onClick={onPrøvIgjen}>
            Prøv igjen
          </Button>
        ) : null}
      </div>
    );
  }

  // Avslutta prosjekt blir berre viste når nokon alt står på dei, så lista
  // ikkje veks med gammalt for kvart år som går.
  const synlege = alle.filter((p) => p.status === "aktiv" || valgte.includes(p.id));

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <FolderKanban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">
          Prosjekttilgang {paakrevd ? <span className="text-destructive">*</span> : null}
        </span>
        {valgte.length > 0 ? (
          <span className="hm-chip border border-primary/25 bg-primary/10 text-primary">{valgte.length} valgt</span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {paakrevd
          ? "En prosjektbruker ser bare prosjektene som er huket av her."
          : "Kontorroller ser alle prosjekter uansett. Huk av her bare hvis du senere vil sette rollen til Prosjekt."}
      </p>

      {status === "laster" ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Henter hvilke prosjekter han står på …
        </p>
      ) : synlege.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Ingen prosjekter opprettet ennå. Lag dem under Admin → Prosjekt.
        </p>
      ) : (
        <ul className="max-h-56 space-y-0.5 overflow-y-auto">
          {synlege.map((p) => (
            <li key={p.id}>
              <label
                htmlFor={`${idPrefiks}-prosjekt-${p.id}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 transition-colors hover:bg-muted"
              >
                <Checkbox
                  id={`${idPrefiks}-prosjekt-${p.id}`}
                  checked={valgte.includes(p.id)}
                  onCheckedChange={() => veksle(p.id)}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="tabular text-muted-foreground">#{p.project_number}</span> {p.name}
                  {p.client ? <span className="text-muted-foreground"> · {p.client}</span> : null}
                </span>
                {p.status === "avsluttet" ? (
                  <span className="hm-chip shrink-0 border border-border bg-muted text-muted-foreground">Avsluttet</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Passordet, vist éin gong.
 *
 * Det blir ikkje lagra nokon stad – verken i basen eller i appen – så dette er
 * einaste høvet til å skrive det ned. Difor står det stort, med kopiknapp, og
 * med ei tydeleg åtvaring om at dialogen ikkje kan opnast att.
 */
function PassordDialog({ data, onClose }: { data: OpprettSvar & { email: string }; onClose: () => void }) {
  const { toast } = useToast();
  const [kopiert, setKopiert] = useState(false);

  // Ryddar opp: lukkast ruta innan to sekund, ville timeouten sett state på ein
  // avmontert komponent.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const kopier = async () => {
    try {
      await navigator.clipboard.writeText(data.password);
      setKopiert(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setKopiert(false), 2000);
    } catch {
      toast({ variant: "destructive", title: "Klarte ikke å kopiere", description: "Marker og kopier for hånd." });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/*
       * Lukkast berre med «Ferdig».
       *
       * Dette er einaste staden passordet finst. Radix lukkar elles på Escape
       * og på klikk utanfor, og eit streiftrykk ville teke det med seg – og då
       * står det ein ny konto der ingen kjenner passordet.
       */}
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="[&>button]:hidden"
      >
        <DialogHeader>
          <DialogTitle>{data.existed ? "Nytt passord satt" : "Brukeren er opprettet"}</DialogTitle>
          <DialogDescription>
            {data.email} kan logge inn med dette nå, og bytte det selv under «Bytt passord».
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
          <p className="tabular select-all break-all text-2xl font-bold tracking-wide text-foreground">
            {data.password}
          </p>
        </div>

        <Button variant="outline" className="h-12 w-full" onClick={kopier}>
          {kopiert ? (
            <>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Kopiert
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              Kopier passordet
            </>
          )}
        </Button>

        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink dark:text-warning">
          Skriv det ned nå. Passordet lagres ingen steder, og denne ruten kan ikke åpnes på nytt. Mister du det, lager
          du bare et nytt.
        </p>

        {data.warning ? <p className="text-sm text-destructive">{data.warning}</p> : null}

        <DialogFooter>
          <Button className="h-11" onClick={onClose}>
            Ferdig
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
