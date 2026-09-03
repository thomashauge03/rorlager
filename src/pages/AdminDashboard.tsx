// Adminpanelet. Sjølve arbeidet ligg i fanene under @/components/admin – denne
// fila held vakta på innlogginga, topplinja og kva fane som er open.

import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FileText,
  FolderKanban,
  Loader2,
  LogOut,
  Package,
  Palette,
  QrCode,
  Settings,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  Users,
} from "lucide-react";
import hmLogo from "@/assets/hm-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemePicker } from "@/components/ThemePicker";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { StockTab } from "@/components/admin/StockTab";
import { QrTab } from "@/components/admin/QrTab";
import { InvoiceTab } from "@/components/admin/InvoiceTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { ProjectsTab } from "@/components/admin/ProjectsTab";
import { ToOrderTab } from "@/components/admin/ToOrderTab";

const TABS = [
  { value: "bestillinger", label: "Bestillinger", Icon: ShoppingCart },
  { value: "abestille", label: "Å bestille", Icon: ShoppingBag },
  { value: "prosjekt", label: "Prosjekt", Icon: FolderKanban },
  { value: "lager", label: "Lager", Icon: Package },
  { value: "qr", label: "QR-koder", Icon: QrCode },
  { value: "faktura", label: "Faktura", Icon: FileText },
  { value: "innstillinger", label: "Innstillinger", Icon: Settings },
] as const;

const DEFAULT_TAB = TABS[0].value;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  /*
   * Økt og rolle. Låg tidlegare som to useQuery og ein useEffect her; er no
   * delt med prosjektsidene, som treng nøyaktig det same.
   *
   * hm_rolle gir 'super_admin' for dei som står i super_admins, så det eigne
   * is_super_admin-kallet trengst ikkje lenger.
   */
  const { checking, email, role, roleKnown } = useAuth(() => navigate("/login", { replace: true }));
  const isSuperAdmin = role === "super_admin";

  /*
   * Prosjektbrukarar høyrer ikkje heime her.
   *
   * Dei har tilgang til appen, men ikkje til admindelen: hm_er_kontor() er
   * usann for dei, så kvar spørjing på denne sida ville svart 200 med null
   * rader. Eit tomt panel er ei dårleg forklaring – dei skal til prosjektsida.
   */
  useEffect(() => {
    if (role === "prosjekt") navigate("/prosjekt", { replace: true });
  }, [role, navigate]);

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

  /*
   * Vent på rolla før fanene blir monterte.
   *
   * useEffect-en over sender prosjektbrukaren vidare, men rendringa skjer
   * først. Gjekk han rett til /admin?fane=lager, monterte StockTab og henta
   * pipe_types før omdirigeringa rakk å skje – stengt for rolla, så det gav
   * null rader og eit blaff av tomt panel. Ingen lekkasje, men eit kall som
   * aldri skulle vore gjort.
   */
  if (!roleKnown || role === "prosjekt") {
    return (
      <div className="min-h-dvh hm-page flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Henter tilgangen din</span>
      </div>
    );
  }

  // Berre eit definitivt nei gir nekting.
  if (role === null) {
    return (
      <div className="min-h-dvh hm-page flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
          <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Ingen tilgang</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Du er innlogga som <strong>{email ?? "ukjend"}</strong>, men kontoen
            er ikkje gitt tilgang til admindelen. Ein administrator må leggje deg
            inn før du ser noko her.
          </p>
        </div>
        <Button variant="outline" onClick={logout}>
          Logg ut
        </Button>
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
          <TabsContent value="abestille" className="animate-fade-in">
            <ToOrderTab />
          </TabsContent>
          <TabsContent value="prosjekt" className="animate-fade-in">
            <ProjectsTab />
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
