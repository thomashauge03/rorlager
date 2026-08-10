import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const MIN_LENGTH = 8;

export function ChangePasswordForm({ email }: { email: string | null }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (next.length < MIN_LENGTH) {
      setError(`Det nye passordet må ha minst ${MIN_LENGTH} tegn.`);
      return;
    }
    if (next !== repeat) {
      setError("De to nye passordene er ikke like.");
      return;
    }
    if (next === current) {
      setError("Det nye passordet er likt det gamle.");
      return;
    }
    if (!email) {
      setError("Fant ikke e-posten til den innloggede brukeren.");
      return;
    }

    setBusy(true);
    // Sjekk det gamle passordet først – elles kunne kven som helst med tilgang til
    // ei open økt (t.d. ein ulåst PC i lageret) byte passordet og stengje eigaren ute
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (authError) {
      setBusy(false);
      setError("Nåværende passord er feil.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updateError) {
      setError("Klarte ikke å endre passordet. Prøv igjen.");
      return;
    }

    setCurrent("");
    setNext("");
    setRepeat("");
    toast({ title: "Passordet er endret", description: "Bruk det nye passordet neste gang du logger inn." });
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Nåværende passord</Label>
        <Input
          id="current-password"
          type="password"
          className="h-11"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setError(null);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password">Nytt passord</Label>
        <Input
          id="new-password"
          type="password"
          className="h-11"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setError(null);
          }}
        />
        <p className="text-xs text-muted-foreground">Minst {MIN_LENGTH} tegn.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="repeat-password">Gjenta nytt passord</Label>
        <Input
          id="repeat-password"
          type="password"
          className="h-11"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
            setError(null);
          }}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11" disabled={busy || !current || !next || !repeat}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Endre passord"}
      </Button>
    </form>
  );
}
