import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Share, Plus } from "lucide-react";
import { useCart } from "@/lib/cart";

/** Utsett til brukaren har fått sjå sida litt – ein boks med ein gong er berre i vegen */
const DELAY_MS = 4000;
const DISMISS_KEY = "rorlager-install-dismissed";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const erAlleredeInstallert = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS bruker eit eige, ikkje-standard flagg
  (navigator as any).standalone === true;

const erIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);

const nylegAvvist = () => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

export function InstallPrompt() {
  const [vis, setVis] = useState(false);
  const [iosRettleiing, setIosRettleiing] = useState(false);
  const [ventandeEvent, setVentandeEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const { count } = useCart();

  useEffect(() => {
    if (erAlleredeInstallert() || nylegAvvist()) return;

    // Android/Chrome: nettlesaren seier frå når appen kan installerast.
    // Vi tek over hendinga for å vise vår eigen boks i staden for deira.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setVentandeEvent(e as BeforeInstallPromptEvent);
      // Sjekk avvising på nytt her: hendinga kan kome fleire gonger i same
      // økta, og då skal ein boks brukaren alt har lukka ikkje dukke opp att
      setTimeout(() => { if (!nylegAvvist()) setVis(true); }, DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS har inga slik hending – Safari kan berre installere via Del-menyen,
    // så der må vi vise ei rettleiing i staden for ein knapp
    let timer: number | undefined;
    if (erIOS()) {
      setIosRettleiing(true);
      timer = window.setTimeout(() => { if (!nylegAvvist()) setVis(true); }, DELAY_MS);
    }

    const onInstalled = () => setVis(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const lukk = () => {
    setVis(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* privat modus */ }
  };

  const installer = async () => {
    if (!ventandeEvent) return;
    await ventandeEvent.prompt();
    const { outcome } = await ventandeEvent.userChoice;
    setVentandeEvent(null);
    setVis(false);
    // Sa brukaren nei, skal vi ikkje mase igjen med ein gong
    if (outcome === "dismissed") {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* privat modus */ }
    }
  };

  // Boksen ligg over CartBar og ville dekt "Se kurven". Har kunden varer i
  // kurven, er uttaket viktigare enn installasjonen – boksen kjem att seinare.
  if (!vis || count > 0) return null;

  // Animasjonen ligg på kortet, ikkje på den faste boksen: fade-in sluttar på
  // translateY, og på wrapperen ville det dytta heile boksen 8 px ned under
  // skjermkanten
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      role="dialog"
      aria-label="Installer appen"
    >
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card shadow-lg p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <span className="hm-logo-badge-sm shrink-0">
            <img src="/icon-192.png" alt="" aria-hidden="true" className="h-9 w-9" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Legg appen på hjemskjermen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Da åpner Rørlager seg som en app, uten adressefelt.
            </p>
          </div>
          <button
            type="button"
            onClick={lukk}
            aria-label="Lukk"
            className="p-1 -m-1 text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {iosRettleiing ? (
          <ol className="mt-3 space-y-1.5 text-sm text-foreground">
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">1.</span>
              Trykk <Share className="h-4 w-4 inline text-primary" aria-label="Del" /> nederst i Safari
            </li>
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">2.</span>
              Velg <Plus className="h-4 w-4 inline text-primary" aria-hidden="true" />
              <span className="font-medium">Legg til på Hjem-skjerm</span>
            </li>
          </ol>
        ) : (
          <Button className="mt-3 w-full h-11" onClick={installer}>
            Installer
          </Button>
        )}
      </div>
    </div>
  );
}
