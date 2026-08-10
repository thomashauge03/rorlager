import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Camera, Lock, MapPin, PackageSearch, Search, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CartBar } from "@/components/CartBar";
import { StockBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QK, fetchCategories, fetchPipeTypes } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import { filterAndSortPipes, matchesSearch, stockStatus } from "@/lib/stock";
import { kr, num, pipeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipeType } from "@/lib/types";

const DEFAULT_INTRO =
  "Skann QR-koden som henger på hylla, eller søk opp røret i lista under. Tast inn hvor mye du tar ut, og legg det i handlekurven.";

/* ------------------------------------------------------------------ */
/*  QR-skanning                                                        */
/* ------------------------------------------------------------------ */

/** BarcodeDetector finst i Chrome på Android, men ikkje i Safari på iPhone.
 *  Der er kameraappen sin eigen QR-lesar like god, så vi seier det heller. */
const hasBarcodeDetector = () => typeof window !== "undefined" && "BarcodeDetector" in window;

/**
 * Plukkar ut hylle-koden frå det QR-en faktisk inneheldt. Vi ser etter stien
 * /r/<slug> uansett kva vertsnamn koden peikar på – etikettar som blei trykte
 * før appen fekk sitt endelege domene skal framleis virke.
 */
function slugFromScan(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const path = text.match(/\/(?:r|vare)\/([^/?#\s]+)/i);
  if (path) return decodeURIComponent(path[1]).toLowerCase();

  // Ein naken kortkode (det som står trykt under QR-en) er også god nok
  if (/^[a-z0-9-]{2,64}$/i.test(text)) return text.toLowerCase();

  return null;
}

type ScanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSlug: (slug: string) => void;
};

function ScanDialog({ open, onOpenChange, onSlug }: ScanDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Treffet skal ikkje starte kameraet på nytt, difor ein ref og ikkje ei avhengigheit
  const onSlugRef = useRef(onSlug);
  useEffect(() => {
    onSlugRef.current = onSlug;
  }, [onSlug]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint(null);

    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // Utan stop() på kvar track blir kameralampa ståande på etter at dialogen er lukka
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Nettleseren gir ikke tilgang til kamera her. Bruk kameraappen på telefonen til å skanne koden.");
        return;
      }

      let detector: { detect: (source: CanvasImageSource) => Promise<{ rawValue?: string }[]> };
      try {
        const Detector = (window as any).BarcodeDetector;
        detector = new Detector({ formats: ["qr_code"] });
      } catch {
        setError("Nettleseren klarte ikke å starte QR-lesing. Bruk kameraappen på telefonen i stedet.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setError("Fikk ikke tilgang til kameraet. Tillat kamera for denne siden, eller bruk kameraappen på telefonen.");
        return;
      }

      if (stopped || !videoRef.current) {
        stop();
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* somme nettlesarar spelar av av seg sjølv – lesinga går uansett */
      }

      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          const value = codes?.[0]?.rawValue;
          if (value) {
            const slug = slugFromScan(value);
            if (slug) {
              stop();
              onSlugRef.current(slug);
              return;
            }
            setHint("Denne koden hører ikke til rørlageret. Prøv en annen.");
          }
        } catch {
          /* eit enkelt bilete kan feile utan at skanninga er øydelagd */
        }
        frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    })();

    return stop;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Skann QR-koden</DialogTitle>
          <DialogDescription>Hold kameraet mot koden som henger på hylla.</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black aspect-[3/4]">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Kamerabilde for QR-skanning"
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="h-48 w-48 rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
        )}

        {hint ? <p className="text-sm text-warning-ink">{hint}</p> : null}

        <Button variant="outline" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
          <X className="h-5 w-5" aria-hidden="true" />
          Avbryt
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Rolig forklaring til iPhone og andre nettlesarar utan BarcodeDetector. */
function NoScanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bruk kameraappen</DialogTitle>
          <DialogDescription>Denne nettleseren kan ikke lese QR-koder selv.</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Åpne kameraappen på telefonen og hold den mot koden på hylla. Da åpnes riktig rør i denne appen. Du kan også
          søke opp røret i lista under.
        </p>
        <Button className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
          Greit
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Varekort                                                           */
/* ------------------------------------------------------------------ */

function PipeCard({ pipe, showPrice }: { pipe: PipeType; showPrice: boolean }) {
  const status = stockStatus(pipe);

  return (
    <Link
      to={`/r/${pipe.qr_slug}`}
      className="hm-card hm-card-interactive animate-fade-in flex flex-col gap-2 p-4 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight text-foreground break-words">
            {pipeLabel(pipe.name, pipe.dimension)}
          </p>
          {pipe.category_name ? (
            <p className="text-xs text-muted-foreground truncate">{pipe.category_name}</p>
          ) : null}
        </div>
        <StockBadge status={status} />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-1">
        <div className="min-w-0 text-sm text-muted-foreground">
          {pipe.location ? (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              {pipe.location}
            </span>
          ) : (
            <span className="tabular">
              {num(pipe.stock)} {pipe.unit} på lager
            </span>
          )}
        </div>
        {showPrice && pipe.price !== null ? (
          <p className="tabular shrink-0 text-sm font-semibold text-foreground">
            {kr(pipe.price)} kr/{pipe.unit}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */

export default function Index() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [noScanOpen, setNoScanOpen] = useState(false);

  const typesQuery = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categoriesQuery = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const showPrices = settings?.show_prices ?? true;
  const intro = settings?.intro_text?.trim() || DEFAULT_INTRO;

  // Kunden skal aldri sjå varer som er tekne ut av sortimentet
  const available = useMemo(
    () => (typesQuery.data ?? []).filter((t) => t.active),
    [typesQuery.data],
  );

  const visible = useMemo(
    () => filterAndSortPipes(available, { search, categoryId, onlyActive: true }),
    [available, search, categoryId],
  );

  // Ein kategori-chip som ikkje ville gitt eit einaste treff er berre i vegen
  const categories = useMemo(() => {
    const hits = available.filter((t) => matchesSearch(t, search));
    return (categoriesQuery.data ?? []).filter((c) => hits.some((t) => t.category_id === c.id));
  }, [categoriesQuery.data, available, search]);

  const openScanner = () => {
    if (hasBarcodeDetector()) setScanOpen(true);
    else setNoScanOpen(true);
  };

  const handleSlug = (slug: string) => {
    setScanOpen(false);
    navigate(`/r/${slug}`);
  };

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Rørlager" subtitle={settings?.company_name} showCart />

      <main className="mx-auto max-w-5xl px-3 pt-4 pb-36 sm:px-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <Button onClick={openScanner} className="mt-4 h-16 w-full text-lg font-semibold [&_svg]:size-6">
          <Camera aria-hidden="true" />
          Skann QR-kode
        </Button>

        <div className="relative mt-5">
          <label htmlFor="sok-ror" className="sr-only">
            Søk etter rør
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="sok-ror"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk på navn, dimensjon, varenr. eller hylle"
            className="h-12 pl-11 pr-11 text-base"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Tøm søket"
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              aria-pressed={categoryId === null}
              className={cn(
                "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                categoryId === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              Alle
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                aria-pressed={categoryId === c.id}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  categoryId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {/* Fargen admin har valt, som prikk og ikkje som bakgrunn: teksten
                    må vere lesbar same kva farge som blir plukka. Den tynne kanten
                    gjer at nesten-kvite og nesten-svarte prikkar ikkje forsvinn. */}
                {c.color ? (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20"
                    style={{ backgroundColor: c.color }}
                  />
                ) : null}
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          {typesQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : typesQuery.isError ? (
            <div className="hm-card p-6 text-center">
              <p className="font-semibold text-foreground">Klarte ikke å hente rørtypene</p>
              <p className="mt-1 text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
              <Button variant="outline" className="mt-4 h-12" onClick={() => typesQuery.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="hm-card flex flex-col items-center gap-2 p-8 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold text-foreground">Ingen rør passer søket</p>
              <p className="text-sm text-muted-foreground">Prøv et annet ord, eller skann koden på hylla.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((pipe) => (
                <PipeCard key={pipe.id} pipe={pipe} showPrice={showPrices} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Adminpanel
          </Link>
        </div>
      </main>

      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} onSlug={handleSlug} />
      <NoScanDialog open={noScanOpen} onOpenChange={setNoScanOpen} />

      <CartBar />
    </div>
  );
}
