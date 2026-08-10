// Adminpanelet. Sjølve arbeidet ligg i fanene under @/components/admin – denne
// fila held vakta på innlogginga, topplinja og kva fane som er open.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, LogOut, Package, Palette, QrCode, Settings, ShoppingCart, Users } from "lucide-react";
import hmLogo from "@/assets/hm-logo.png";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemePicker } from "@/components/ThemePicker";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { StockTab } from "@/components/admin/StockTab";
import { QrTab } from "@/components/admin/QrTab";
import { InvoiceTab } from "@/components/admin/InvoiceTab";
import { SettingsTab } from "@/components/admin/SettingsTab";

const TABS = [
  { value: "bestillinger", label: "Bestillinger", Icon: ShoppingCart },
  { value: "lager", label: "Lager", Icon: Package },
  { value: "qr", label: "QR-koder", Icon: QrCode },
  { value: "faktura", label: "Faktura", Icon: FileText },
  { value: "innstillinger", label: "Innstillinger", Icon: Settings },
] as const;

const DEFAULT_TAB = TABS[0].value;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // "checking" hindrar at panelet blinkar fram for ein utlogga besøkande
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const handle = (session: Session | null) => {
      if (!alive) return;
      setEmail(session?.user?.email ?? null);
      if (!session) navigate("/login", { replace: true });
    };

    // Lyttaren blir sett opp før getSession, slik at ei utlogging i ei anna fane
    // ikkje kan gli forbi medan den første sjekken går
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => handle(session));

    supabase.auth.getSession().then(({ data }) => {
      handle(data.session);
      if (alive) setChecking(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  // Brukarsida er berre for superadmin. Svaret endrar seg ikkje i ei økt,
  // difor eitt kall som blir liggjande i cachen.
  const { data: isSuperAdmin } = useQuery({
    queryKey: ["is_super_admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_super_admin");
      if (error) return false;
      return Boolean(data);
    },
    enabled: !checking && !!email,
    staleTime: Infinity,
  });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const requested = params.get("fane");
  const tab = TABS.some((t) => t.value === requested) ? (requested as string) : DEFAULT_TAB;

  // Fana ligg i URL-en så ei oppdatering av sida hamnar same stad. replace,
  // elles ville tilbakeknappen gå fane for fane gjennom heile økta.
  const setTab = (value: string) => setParams({ fane: value }, { replace: true });

  if (checking) {
    return (
      <div className="min-h-dvh hm-page flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Sjekker innlogging</span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh hm-page flex flex-col">
      <header className="hm-topbar sticky top-0 z-30">
        <div className="pt-[env(safe-area-inset-top)]">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
            <span className="hm-logo-badge">
              <img src={hmLogo} alt="Hauge Maskin" className="h-7 w-auto" />
            </span>

            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold leading-tight truncate">Adminpanel · Rørlager</h1>
              <p className="text-xs text-white/60 truncate">{email ?? "Innlogget"}</p>
            </div>

            <div className="shrink-0 flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Fargetema"
                    className="h-11 w-11 rounded-md flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Palette className="h-5 w-5" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72">
                  <p className="text-sm font-semibold text-foreground mb-2">Fargetema</p>
                  <ThemePicker />
                </PopoverContent>
              </Popover>

              {isSuperAdmin ? (
                <Link
                  to="/admin/brukere"
                  className="h-11 px-2 sm:px-3 rounded-md flex items-center gap-2 text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <Users className="h-5 w-5" aria-hidden="true" />
                  <span className="hidden sm:inline">Brukere</span>
                </Link>
              ) : null}

              <Button
                variant="ghost"
                onClick={logout}
                className="h-11 px-2 sm:px-3 text-white hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-5 w-5 sm:mr-2" aria-hidden="true" />
                <span className="hidden sm:inline">Logg ut</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto p-3 sm:p-4 flex-1">
        <Tabs value={tab} onValueChange={setTab}>
          {/* Rullbar fanelinje: på telefon får ikkje fem faner plass ved sida av kvarandre */}
          <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 mb-4 overflow-x-auto">
            <TabsList className="h-auto w-max gap-1 bg-muted p-1">
              {TABS.map(({ value, label, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 gap-2 px-3 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="bestillinger" className="animate-fade-in">
            <OrdersTab />
          </TabsContent>
          <TabsContent value="lager" className="animate-fade-in">
            <StockTab />
          </TabsContent>
          <TabsContent value="qr" className="animate-fade-in">
            <QrTab />
          </TabsContent>
          <TabsContent value="faktura" className="animate-fade-in">
            <InvoiceTab />
          </TabsContent>
          <TabsContent value="innstillinger" className="animate-fade-in">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-8 border-t border-border bg-card/60 shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="hm-logo-badge-sm">
              <img src={hmLogo} alt="" aria-hidden="true" className="h-6 w-auto" />
            </span>
            <span className="text-sm text-muted-foreground">Hauge Maskin AS</span>
          </div>
          <span className="text-xs text-muted-foreground tabular">Rørlager</span>
        </div>
      </footer>
    </div>
  );
}
