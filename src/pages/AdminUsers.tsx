import { useCallback, useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Info, KeyRound, Loader2, Pencil, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { shortDate } from "@/lib/format";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "kontor", label: "Kontor" },
  { value: "lager", label: "Lager" },
];

const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

type Draft = { email: string; full_name: string; role: string; note: string };

const EMPTY_DRAFT: Draft = { email: "", full_name: "", role: "admin", note: "" };

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function AdminUsers() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [registryReady, setRegistryReady] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [users, setUsers] = useState<SystemUserRow[]>([]);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<SystemUserRow | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [toDelete, setToDelete] = useState<SystemUserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("system_users")
      .select("id, created_at, email, full_name, role, note, created_by")
      .order("created_at", { ascending: false });
    setLoadingUsers(false);
    if (error) {
      setRegistryReady(false);
      return;
    }
    setRegistryReady(true);
    setUsers((data ?? []) as SystemUserRow[]);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      setMyEmail(user.email ?? null);
      // Tilgangen blir avgjord av RLS i databasen; denne sjekken styrer berre
      // kva grensesnittet viser
      const { data, error } = await supabase.rpc("is_super_admin", {});
      const ok = !error && data === true;
      setAllowed(ok);
      setChecking(false);
      if (ok) fetchUsers();
    })();
  }, [navigate, fetchUsers]);

  const addUser = async () => {
    const email = draft.email.trim().toLowerCase();
    if (!isEmail(email)) {
      toast({ title: "Ugyldig e-post", description: "Skriv en gyldig e-postadresse.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("system_users").insert({
      email,
      full_name: draft.full_name.trim() || null,
      role: draft.role,
      note: draft.note.trim() || null,
    });
    setSaving(false);

    if (error) {
      const duplicate = (error as { code?: string }).code === "23505";
      toast({
        title: duplicate ? "E-posten står allerede i registeret" : "Klarte ikke å legge til brukeren",
        description: duplicate ? "Rediger den eksisterende oppføringen i stedet." : "Prøv igjen.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Lagt til i registeret", description: email });
    setDraft(EMPTY_DRAFT);
    fetchUsers();
  };

  const openEdit = (user: SystemUserRow) => {
    setEditing(user);
    setEditDraft({
      email: user.email,
      full_name: user.full_name ?? "",
      role: user.role,
      note: user.note ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const email = editDraft.email.trim().toLowerCase();
    if (!isEmail(email)) {
      toast({ title: "Ugyldig e-post", description: "Skriv en gyldig e-postadresse.", variant: "destructive" });
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
    setSaving(false);

    if (error) {
      toast({ title: "Klarte ikke å lagre endringen", description: "Prøv igjen.", variant: "destructive" });
      return;
    }

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
          <div className="rounded-lg border border-warning/60 bg-warning/10 px-3 py-2.5">
            <p className="text-sm text-warning-ink">
              Fikk ikke lest tabellen <code className="text-xs">system_users</code>. Kjør migrasjonen{" "}
              <code className="text-xs">supabase/migrations/20260810100100_rorlager_admins.sql</code>.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5 flex gap-2.5">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Denne listen er et <span className="font-medium text-foreground">register</span> over hvem som skal ha
            tilgang – navn, rolle og notat. Selve påloggingen opprettes i Supabase under Authentication, ikke her. Legger
            du til noen her uten å opprette brukeren i Supabase, får de ingen tilgang.
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

            <Button className="h-11 w-full sm:w-auto" onClick={addUser} disabled={saving || !draft.email.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Legg til i registeret"}
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
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="h-11" onClick={() => setEditing(null)}>
              Avbryt
            </Button>
            <Button className="h-11" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Lagre"}
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
    </div>
  );
}
