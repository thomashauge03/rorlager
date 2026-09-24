import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Camera, Lock, MapPin, PackageSearch, Search, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CartBar } from "@/components/CartBar";
import { StockBadge } from "@/components/StatusBadge";
import { Scanner } from "@/components/Scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QK, fetchCatalog, fetchCategories } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { filterAndSortPipes, matchesSearch, stockStatus } from "@/lib/stock";
import { kr, num, pipeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/lib/types";

const DEFAULT_INTRO =
  "Skann QR-koden som henger på hylla, eller søk opp røret i lista under. Tast inn hvor mye du tar ut, og legg det i handlekurven.";

/* ------------------------------------------------------------------ */
/*  Varekort                                                           */
/* ------------------------------------------------------------------ */

// CatalogItem og ikkje PipeType: framsida les katalogvisninga, som ikkje har
// cost_price. Typen held innkjøpsprisen ute av kundesida for godt.
function PipeCard({ pipe, showPrice }: { pipe: CatalogItem; showPrice: boolean }) {
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
  const { data: orderSettings } = useOrderSettings();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Katalogvisninga, ikkje pipe_types. Framsida blir opna av kundar utan
  // innlogging, og tabellen er stengd for dei – i tillegg til at ho ber på
  // innkjøpsprisen, som ingen kunde skal sjå.
  const typesQuery = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog });
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

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Rørlager" subtitle={settings?.company_name} showCart />

      <main className="mx-auto max-w-5xl px-3 pt-4 pb-36 sm:px-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <Button onClick={() => setScanOpen(true)} className="mt-4 h-16 w-full text-lg font-semibold [&_svg]:size-6">
          <Camera aria-hidden="true" />
          Skann QR-kode
        </Button>

        {/* Lenkja kjem berre når kontoret har opna for bestilling på nett */}
        {orderSettings?.accept_orders ? (
          <Button asChild variant="outline" className="mt-3 h-12 w-full text-base [&_svg]:size-5">
            <Link to="/bestill">
              <CalendarClock aria-hidden="true" />
              Bestill til henting
            </Link>
          </Button>
        ) : null}

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
                    må vere lesbar same kva farge som blir plukka. */}
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

      {/* Same skannar som butikken. Han går til varesida, som slår opp koden
          som QR-slug og deretter som varenummer. */}
      <Scanner
        open={scanOpen}
        onOpenChange={setScanOpen}
        title="Skann QR-koden"
        description="Hold kameraet mot koden som henger på hylla."
        onCode={(kode) => {
          setScanOpen(false);
          navigate(`/r/${encodeURIComponent(kode)}`);
          return null;
        }}
      />

      <CartBar />
    </div>
  );
}
