// Adminpanelet. Sjølve arbeidet ligg i fanene under @/components/admin – denne
// fila held vakta på innlogginga, topplinja og kva fane som er open.

import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FileText,
  FolderKanban,
  KeyRound,
  Lightbulb,
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
import { useQueryClient } from "@tanstack/react-query";
import { erKontorRolle, heimFor, loggUt, useAuth } from "@/lib/auth";
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
import { SuggestionsTab } from "@/components/admin/SuggestionsTab";
import { useNewSuggestionCount } from "@/lib/suggestions";
import { useWaitingPickupOrders } from "@/lib/pickup-orders";
import { faneFor, lesDyplenke, type Dyplenke } from "@/lib/dyplenke";

const TABS = [
  { value: "bestillinger", label: "Bestillinger", Icon: ShoppingCart },
  { value: "abestille", label: "Å bestille", Icon: ShoppingBag },
  { value: "prosjekt", label: "Prosjekt", Icon: FolderKanban },
  { value: "lager", label: "Lager", Icon: Package },
  { value: "forslag", label: "Forslag", Icon: Lightbulb },
  { value: "qr", label: "QR-koder", Icon: QrCode },
  { value: "faktura", label: "Faktura", Icon: FileText },
  { value: "innstillinger", label: "Innstillinger", Icon: Settings },
] as const;

const DEFAULT_TAB = TABS[0].value;

/*
 * Lagermannen sitt panel: det han treng for å drive lageret – uttak og henting,
 * mottak, beholdning, forslag og etikettar. Ikkje faktura, prosjektstyring
 * eller innstillingar med påslag og firmaopplysningar, og ikkje innkjøpsprisar
 * i lagerlista.
 *
 * NB: dette er panelet, ikkje tilgangen. hm_er_kontor() gjeld framleis for
 * «lager», så basen ville svart på dei same spørjingane. Skal lagermannen
 * stengjast ute frå innkjøpsprisar i basen òg, må rolla ut av kvitlista der.
 */
const LAGER_FANER: readonly string[] = ["bestillinger", "abestille", "lager", "forslag", "qr"];

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
  const queryClient = useQueryClient();
  /*
   * Hele stien med query følger med til innloggingen, så en dyplenke fra
   * Innboks (/admin?fane=bestillinger&ordre=1042) havner på saken etterpå og
   * ikke bare på /admin. window.location og ikke useLocation: useAuth tar vare
   * på denne funksjonen fra første render.
   *
   * Uten økt kalles den to ganger ved oppstart (lytteren og getSession). Den
   * andre gangen står vi allerede på /login, og da ville next blitt pakket inn
   * i seg selv.
   */
  const { checking, email, role, roleKnown, roleFailed, prøvRolleIgjen } = useAuth(() => {
    const her = window.location.pathname + window.location.search;
    if (!her.startsWith("/admin")) return;
    navigate(`/login?next=${encodeURIComponent(her)}`, { replace: true });
  });
  const isSuperAdmin = role === "super_admin";

  // Talet på fana Bestillinger. Berre for kontoret: ein prosjektbrukar blir
  // send vidare, og ein utan rolle ser ingen faner.
  const kontor = roleKnown && erKontorRolle(role);
  /** Har ei rolle, men ikkje ei som ser panelet: prosjekt eller ansatt. */
  const skalVidare = roleKnown && role !== null && !kontor;
  const venter = useWaitingPickupOrders(kontor);
  const antallVenter = venter.data?.length ?? 0;
  const antallForslag = useNewSuggestionCount(kontor);

  /*
   * Prosjektbrukarar og vanlege tilsette høyrer ikkje heime her.
   *
   * Dei har tilgang til appen, men ikkje til admindelen: hm_er_kontor() er
   * usann for dei, så kvar spørjing på denne sida ville svart 200 med null
   * rader. Eit tomt panel er ei dårleg forklaring – prosjektbrukaren skal til
   * prosjektsida, den tilsette til framsida.
   */
  useEffect(() => {
    if (skalVidare && role) navigate(heimFor(role), { replace: true });
  }, [skalVidare, role, navigate]);

  const logout = async () => {
    await loggUt(queryClient);
    navigate("/login", { replace: true });
  };

  // En dyplenke fra Innboks bestemmer fanen selv, se faneFor.
  const dyplenke = lesDyplenke(params);
  const requested = params.get("fane");
  const erLager = role === "lager";
  const faner = erLager ? TABS.filter((t) => LAGER_FANER.includes(t.value)) : TABS;
  const ønskt = dyplenke ? faneFor(dyplenke) : requested;
  // Ei fane rolla ikkje har – frå ei lenkje eller ein dyplenke – blir startfana
  const tab = faner.some((t) => t.value === ønskt) ? (ønskt as string) : DEFAULT_TAB;
  const nr = (type: Dyplenke["type"]) => (dyplenke?.type === type && "nummer" in dyplenke ? dyplenke.nummer : null);
  const dypId = (type: Dyplenke["type"]) => (dyplenke?.type === type && "id" in dyplenke ? dyplenke.id : null);

  // Fana ligg i URL-en så ei oppdatering av sida hamnar same stad. replace,
  // elles ville tilbakeknappen gå fane for fane gjennom heile økta.
  // Et fanebytte tar også bort dyplenken, ellers ville den holdt brukeren fast.
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
  /*
   * Gav rolleoppslaget opp, seier vi det.
   *
   * Tidlegare var vilkåret berre `!roleKnown`, og roleKnown blir aldri sann på
   * ein feila spørjing – så eit nettverksglipp gav «Henter tilgangen din» for
   * alltid, utan feilmelding, utan «Prøv igjen» og utan «Logg ut». Kontoret
   * måtte lukke appen.
   */
  if (roleFailed) {
    return (
      <div className="min-h-dvh hm-page flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
          <ShieldAlert className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Fikk ikke sjekket tilgangen din</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Sjekk at du har nett, og prøv igjen. Står det seg, logg ut og inn på nytt.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={prøvRolleIgjen}>Prøv igjen</Button>
          <Button variant="outline" onClick={logout}>
            Logg ut
          </Button>
        </div>
      </div>
    );
  }

  if (!roleKnown || skalVidare) {
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
                  aria-label="Brukere"
                  className="h-11 px-2 sm:px-3 rounded-md flex items-center gap-2 text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <Users className="h-5 w-5" aria-hidden="true" />
                  <span className="hidden sm:inline">Brukere</span>
                </Link>
              ) : null}

              <Link
                to="/konto"
                aria-label="Bytt passord"
                className="h-11 px-2 sm:px-3 rounded-md flex items-center gap-2 text-sm text-white hover:bg-white/10 transition-colors"
              >
                <KeyRound className="h-5 w-5" aria-hidden="true" />
                <span className="hidden sm:inline">Bytt passord</span>
              </Link>

              <Button
                variant="ghost"
                onClick={logout}
                aria-label="Logg ut"
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
              {faner.map(({ value, label, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 gap-2 px-3 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                  {value === "bestillinger" && antallVenter > 0 ? (
                    <span className="tabular ml-0.5 min-w-[1.25rem] rounded-full bg-destructive px-1.5 text-center text-[0.7rem] font-bold leading-5 text-destructive-foreground">
                      {antallVenter}
                      <span className="sr-only"> venter på godkjenning</span>
                    </span>
                  ) : null}
                  {value === "forslag" && antallForslag > 0 ? (
                    <span className="tabular ml-0.5 min-w-[1.25rem] rounded-full bg-destructive px-1.5 text-center text-[0.7rem] font-bold leading-5 text-destructive-foreground">
                      {antallForslag}
                      <span className="sr-only"> nye forslag</span>
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="bestillinger" className="animate-fade-in">
            <OrdersTab ordre={nr("ordre")} />
          </TabsContent>
          <TabsContent value="abestille" className="animate-fade-in">
            <ToOrderTab behov={nr("behov")} mottak={nr("mottak")} />
          </TabsContent>
          <TabsContent value="prosjekt" className="animate-fade-in">
            <ProjectsTab />
          </TabsContent>
          <TabsContent value="lager" className="animate-fade-in">
            <StockTab visKostpris={!erLager} vare={dypId("vare")} />
          </TabsContent>
          <TabsContent value="forslag" className="animate-fade-in">
            <SuggestionsTab visKostpris={!erLager} forslag={dypId("forslag")} />
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
