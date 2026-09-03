import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { checkRateLimit } from "@/lib/rate-limiter";
import hmLogo from "@/assets/hm-logo.png";

/** Supabase svarar på engelsk – her set vi om dei feila kunden faktisk kan møte. */
function norwegianAuthError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login")) return "Feil e-post eller passord.";
  if (m.includes("email not confirmed")) return "E-posten er ikke bekreftet ennå.";
  if (m.includes("rate limit") || m.includes("too many")) return "For mange forsøk. Vent litt og prøv igjen.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Fikk ikke kontakt med serveren. Sjekk nettet.";
  return "Klarte ikke å logge inn. Prøv igjen.";
}


/**
 * Sender brukaren dit han faktisk høyrer heime.
 *
 * Begge stadene gjekk til /admin uansett rolle. Ein prosjektbrukar hamna då i
 * adminpanelet, såg ein spinnar, og blei kasta vidare av AdminDashboard. Det
 * virka – men berre så lenge rollekallet lukkast. Feila det, sat han fast på
 * ein spinnar i eit panel han ikkje har tilgang til.
 */
async function heimeside(): Promise<string> {
  /*
   * .rpc() KASTAR ALDRI.
   *
   * Han resolverer med { data: null, error }, så ein try/catch her hadde vore
   * daud kode – og kvar einaste feil ville gitt data === null, altså «/admin»,
   * som er nøyaktig det ein prosjektbrukar ikkje skal.
   *
   * Og han har inga tidsavgrensing. Utan Promise.race ville ein tenar som ikkje
   * svarar late brukaren stå på ein spinnar utan veg vidare.
   */
  const svar = await Promise.race([
    supabase.rpc("hm_rolle"),
    new Promise<{ data: null; error: true }>((r) => setTimeout(() => r({ data: null, error: true }), 8000)),
  ]);

  if (svar.error || svar.data == null) {
    // Vi VEIT ikkje kven han er. Prosjektsida er den trygge gissinga: kjem ein
    // kontorbrukar dit, ser han prosjekta sine og kan gå vidare sjølv. Kjem ein
    // prosjektbrukar til /admin, møter han eit panel han ikkje har tilgang til.
    return "/prosjekt";
  }
  return svar.data === "prosjekt" ? "/prosjekt" : "/admin";
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Har brukaren alt ei gyldig økt, er innloggingsskjemaet berre eit hinder
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) {
        setChecking(false);
        return;
      }
      // setChecking(false) òg her: heimeside() er ikkje lenger synkron, og utan
      // dette ville ein innlogga brukar stått på ein evig spinnar dersom
      // rolleoppslaget heng.
      heimeside().then((v) => {
        if (!alive) return;
        setChecking(false);
        navigate(v, { replace: true });
      });
    });
    return () => {
      alive = false;
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Bremsar gjetting av passord frå same nettlesar: 5 forsøk per 5 minutt
    const rl = checkRateLimit("admin-login", 5, 300_000);
    if (!rl.allowed) {
      const secs = Math.ceil(rl.retryAfterMs / 1000);
      toast({
        title: "For mange forsøk",
        description: `Vent ${secs} sekunder før du prøver igjen.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setLoading(false);
      toast({ title: "Innlogging feilet", description: norwegianAuthError(error.message), variant: "destructive" });
      return;
    }

    /*
     * setLoading(false) står IKKE her.
     *
     * Det lå over, før rolleoppslaget — så knappen var aktiv gjennom hele
     * heimeside(). Fem utålmodige trykk i det vinduet brenner rate-limiteren
     * (5 forsøk per 5 minutt), og brukeren blir utestengt med riktig passord.
     * På en byggeplass med halv dekning er det vinduet ikke teoretisk.
     *
     * Knappen blir stående deaktivert til vi navigerer bort.
     */
    navigate(await heimeside(), { replace: true });
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
      <div className="p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Button
          variant="ghost"
          className="h-12 text-white hover:bg-white/10 hover:text-white"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" /> Tilbake
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pb-16">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-lg">
              <img src={hmLogo} alt="Hauge Maskin" className="h-14 w-auto" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Adminpanel</h1>
              <p className="text-sm text-white/60 mt-1">Logg inn for å styre rørlageret</p>
            </div>
          </div>

          <Card className="border-0 shadow-xl">
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">E-post</Label>
                  <Input
                    id="login-email"
                    type="email"
                    className="h-12"
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    inputMode="email"
                    placeholder="navn@haugemaskin.no"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Passord</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      className="h-12 pr-12"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Skjul passord" : "Vis passord"}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Logg inn"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-white/40 mt-6">&copy; Hauge Maskin AS 2026</p>
        </div>
      </div>
    </div>
  );
}
