import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, KeyRound, Loader2, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchMåByttePassord, heimeside, loggUt, måByttePassordKey } from "@/lib/auth";
import { MIN_LENGDE, norskPassordFeil, sjekkNyttPassord } from "@/lib/passord";

/**
 * Første innlogging: den tilsette vel sitt eige passord.
 *
 * Superadmin kjenner det mellombelse, så ingen kjem vidare før det er bytt –
 * useAuth sender han hit frå alle sidene bak innlogginga.
 *
 * Sida spør ikkje etter det gamle passordet, fordi han nettopp skreiv det.
 * Difor slepp ho berre inn den som faktisk har merket. Utan den vakta ville
 * kven som helst ved ein ulåst PC kunne byte passordet til ein annan her, og
 * gå rundt kravet om noverande passord i «Bytt passord».
 */
export default function NyttPassord() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [nytt, setNytt] = useState("");
  const [gjenta, setGjenta] = useState("");
  const [vis, setVis] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  /** Passordet er bytt, men merket står att. Då skal berre merket prøvast på nytt. */
  const [byttetUtanMerke, setByttetUtanMerke] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }
      if (!(await fetchMåByttePassord())) {
        if (alive) navigate(await heimeside({ sjekkPassord: false }), { replace: true });
        return;
      }
      if (!alive) return;
      setEmail(data.session.user.email ?? null);
      setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  const ferdig = async () => {
    const { error } = await supabase.rpc("hm_passord_byttet");
    if (error) {
      setBusy(false);
      setByttetUtanMerke(true);
      setFeil("Passordet er byttet, men vi fikk ikke lagret det. Trykk «Prøv igjen».");
      return;
    }
    // Utan dette ville useAuth på neste side lese det gamle svaret frå cachen
    // og sende han rett tilbake hit.
    queryClient.setQueryData(måByttePassordKey(email), false);
    toast({ title: "Passordet er lagret", description: "Bruk det nye passordet neste gang du logger inn." });
    navigate(await heimeside({ sjekkPassord: false }), { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeil(null);
    setBusy(true);

    if (byttetUtanMerke) {
      await ferdig();
      return;
    }

    const galt = sjekkNyttPassord(nytt, gjenta);
    if (galt) {
      setBusy(false);
      setFeil(galt);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nytt });
    if (error) {
      setBusy(false);
      setFeil(norskPassordFeil(error));
      return;
    }
    await ferdig();
  };

  if (checking) {
    return (
      <div className="min-h-dvh hm-brand-surface flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-label="Laster" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col hm-brand-surface">
      <div className="p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex justify-end">
        <Button
          variant="ghost"
          className="h-12 text-white hover:bg-white/10 hover:text-white"
          onClick={async () => {
            await loggUt(queryClient);
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="h-4 w-4 mr-2" aria-hidden="true" /> Logg ut
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-16">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex flex-col items-center gap-4 mb-6 text-center">
            <div className="bg-white rounded-2xl p-4 shadow-lg">
              <KeyRound className="h-10 w-10 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Velg ditt eget passord</h1>
              <p className="text-sm text-white/70 mt-1">
                Du logget inn med et midlertidig passord. Velg et nytt før du går videre.
              </p>
              {email ? <p className="text-xs text-white/50 mt-2 break-all">{email}</p> : null}
            </div>
          </div>

          <Card className="border-0 shadow-xl">
            <CardContent className="pt-6">
              <form onSubmit={submit} className="space-y-4">
                {/* Skjult brukarnamn: passordhandsamaren i nettlesaren lagrar då
                    det nye passordet på rett konto */}
                <input type="email" autoComplete="username" value={email ?? ""} readOnly hidden />

                <div className="space-y-1.5">
                  <Label htmlFor="nytt-passord">Nytt passord</Label>
                  <div className="relative">
                    <Input
                      id="nytt-passord"
                      type={vis ? "text" : "password"}
                      className="h-12 pr-12"
                      autoComplete="new-password"
                      autoFocus
                      disabled={byttetUtanMerke}
                      value={nytt}
                      onChange={(e) => {
                        setNytt(e.target.value);
                        setFeil(null);
                      }}
                      aria-describedby="nytt-passord-hjelp"
                    />
                    <button
                      type="button"
                      onClick={() => setVis((v) => !v)}
                      aria-label={vis ? "Skjul passord" : "Vis passord"}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {vis ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <p id="nytt-passord-hjelp" className="text-xs text-muted-foreground">
                    Minst {MIN_LENGDE} tegn, og ikke det samme som du fikk tildelt.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="gjenta-passord">Gjenta nytt passord</Label>
                  <Input
                    id="gjenta-passord"
                    type={vis ? "text" : "password"}
                    className="h-12"
                    autoComplete="new-password"
                    disabled={byttetUtanMerke}
                    value={gjenta}
                    onChange={(e) => {
                      setGjenta(e.target.value);
                      setFeil(null);
                    }}
                  />
                </div>

                {feil ? (
                  <p className="text-sm text-destructive-ink" role="alert">
                    {feil}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold"
                  disabled={busy || (!byttetUtanMerke && (!nytt || !gjenta))}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : byttetUtanMerke ? (
                    "Prøv igjen"
                  ) : (
                    "Lagre passord"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
