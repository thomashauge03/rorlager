// Butikken: søk eller skann, legg rør i bestillinga, og gå til kassen. Same
// katalog som framsida, men for den som bestiller til henting – ikkje den som
// står ved hylla og tek ut sjølv.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Camera, PackageSearch, Phone, Plus, Search, X } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { StockBadge } from "@/components/StatusBadge";
import { QuantityInput } from "@/components/QuantityInput";
import { Scanner } from "@/components/Scanner";
import { PickupCartBar } from "@/components/PickupCartBar";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QK, fetchCatalog, fetchCategories } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { filterAndSortPipes, matchesSearch, stockStatus } from "@/lib/stock";
import { finnVare } from "@/lib/scanner";
import { pickupLineFromItem, usePickupCart } from "@/lib/pickup-cart";
import { linjesum, prisInklMva, summer } from "@/lib/mva";
import { kr, num, pipeLabel, qtyLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/lib/types";

const telLenke = (telefon: string) => `tel:${telefon.replace(/\s/g, "")}`;

/**
 * Pris per eining: inkl. mva stort, eks. mva under. Butikken vender seg til både
 * privatpersonar og bedrifter, og kunden har ikkje valt enno. Innstillinga «Vis
 * priser for kunden» gjeld ikkje her – ein privatperson skal sjå prisen før han
 * bestiller.
 */
function Pris({ price, unit, vat }: { price: number | null; unit: string; vat: number }) {
  if (price === null) return <span className="block text-sm font-medium text-muted-foreground">Ring oss for pris</span>;
  return (
    <span className="block text-right">
      <span className="tabular block text-base font-bold text-foreground">
        {kr(prisInklMva(price, vat))} kr/{unit}
      </span>
      <span className="tabular block text-xs text-muted-foreground">{kr(price)} eks. mva</span>
    </span>
  );
}

function VareKort({ vare, vat, onVelg }: { vare: CatalogItem; vat: number; onVelg: (v: CatalogItem) => void }) {
  const namn = pipeLabel(vare.name, vare.dimension);
  return (
    <button
      type="button"
      onClick={() => onVelg(vare)}
      aria-label={vare.price === null ? `${namn}, ring for pris` : `${namn}, legg i bestillingen`}
      className="hm-card hm-card-interactive animate-fade-in flex flex-col gap-2 p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block break-words text-lg font-bold leading-tight text-foreground">{namn}</span>
          {vare.category_name ? (
            <span className="block truncate text-xs text-muted-foreground">{vare.category_name}</span>
          ) : null}
        </span>
        <StockBadge status={stockStatus(vare)} />
      </span>
      <span className="mt-auto flex items-end justify-between gap-3 pt-1">
        <span className="text-xs text-muted-foreground">{vare.sku ?? ""}</span>
        <Pris price={vare.price} unit={vare.unit} vat={vat} />
      </span>
    </button>
  );
}

function LeggTil({
  vare,
  vat,
  telefon,
  onFerdig,
}: {
  vare: CatalogItem;
  vat: number;
  telefon: string | null | undefined;
  onFerdig: () => void;
}) {
  const cart = usePickupCart();
  const [mengde, setMengde] = useState<number | null>(null);

  if (vare.price === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Denne varen har ingen pris ennå, så den kan ikke bestilles på nett. Ring oss, så finner vi ut av det.
        </p>
        {telefon ? (
          <Button asChild className="h-12 w-full text-base">
            <a href={telLenke(telefon)}>
              <Phone className="h-5 w-5" aria-hidden="true" />
              Ring {telefon}
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  const pris = vare.price;
  const iKurva = cart.lines.find((l) => l.pipe_type_id === vare.id)?.quantity ?? 0;
  const samla = Math.round(((mengde ?? 0) + iKurva) * 100) / 100;
  const forLite = mengde !== null && mengde > 0 && samla > vare.stock;

  const leggTil = () => {
    if (mengde === null || mengde <= 0) {
      toast.error("Skriv inn hvor mye du vil bestille");
      return;
    }
    const linje = pickupLineFromItem(vare, mengde);
    if (!linje) return;
    cart.add(linje);
    toast.success(`${qtyLabel(mengde, vare.unit)} ${pipeLabel(vare.name, vare.dimension)} lagt i bestillingen`);
    onFerdig();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          På lager:{" "}
          <span className="tabular font-semibold text-foreground">
            {num(vare.stock)} {vare.unit}
          </span>
        </span>
        <Pris price={pris} unit={vare.unit} vat={vat} />
      </div>

      <QuantityInput value={mengde} onChange={setMengde} unit={vare.unit} autoFocus />

      {iKurva > 0 ? (
        <p className="tabular rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Du har allerede {qtyLabel(iKurva, vare.unit)} i bestillingen.
        </p>
      ) : null}

      {/* Åtvaring, ikkje sperre: kontoret sjekkar før bestillinga blir godkjend */}
      {forLite ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/15 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
          <p className="tabular text-sm text-warning-ink">
            Lageret viser {num(vare.stock)} {vare.unit}. Kontoret sjekker resten.
          </p>
        </div>
      ) : null}

      {mengde !== null && mengde > 0 ? (
        <p className="tabular text-right text-sm text-muted-foreground">
          Sum: <span className="font-semibold text-foreground">{kr(summer([linjesum(pris, mengde)], vat).inkl)} kr</span>{" "}
          inkl. mva
        </p>
      ) : null}

      <Button
        className="h-14 w-full text-lg font-semibold [&_svg]:size-6"
        disabled={mengde === null || mengde <= 0}
        onClick={leggTil}
      >
        <Plus aria-hidden="true" />
        Legg i bestillingen
      </Button>
    </div>
  );
}

export default function PickupShop() {
  const { data: settings } = useSettings();
  const orderSettings = useOrderSettings();
  const [sok, setSok] = useState("");
  const [kategori, setKategori] = useState<string | null>(null);
  const [skannar, setSkannar] = useState(false);
  const [valt, setValt] = useState<CatalogItem | null>(null);

  const katalog = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog });
  const kategoriar = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const vat = settings?.vat_rate ?? 25;
  const telefon = settings?.phone;

  const tilgjengelege = useMemo(() => (katalog.data ?? []).filter((t) => t.active), [katalog.data]);
  const synlege = useMemo(
    () => filterAndSortPipes(tilgjengelege, { search: sok, categoryId: kategori, onlyActive: true }),
    [tilgjengelege, sok, kategori],
  );
  const chips = useMemo(() => {
    const treff = tilgjengelege.filter((t) => matchesSearch(t, sok));
    return (kategoriar.data ?? []).filter((c) => treff.some((t) => t.category_id === c.id));
  }, [kategoriar.data, tilgjengelege, sok]);

  const onKode = (kode: string): string | null => {
    const vare = finnVare(kode, tilgjengelege);
    if (!vare) return `Fant ingen vare med koden ${kode}. Prøv søkefeltet.`;
    setSkannar(false);
    setValt(vare);
    return null;
  };

  const lastar = orderSettings.isPlaceholderData || orderSettings.isLoading;
  const open = orderSettings.data?.accept_orders === true;

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Bestill til henting" subtitle={settings?.company_name} back="/" />

      <main className="mx-auto max-w-5xl px-3 pt-4 pb-36 sm:px-4">
        {lastar ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        ) : !open ? (
          <div className="hm-card mx-auto flex max-w-lg flex-col items-center gap-3 p-8 text-center">
            <PackageSearch className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Vi tar ikke imot bestillinger på nett akkurat nå</h2>
            <p className="text-sm text-muted-foreground">
              {telefon ? `Ring oss på ${telefon}, så hjelper vi deg.` : "Ta kontakt med oss, så hjelper vi deg."}
            </p>
            {telefon ? (
              <Button asChild className="h-12 w-full text-base">
                <a href={telLenke(telefon)}>
                  <Phone className="h-5 w-5" aria-hidden="true" />
                  Ring {telefon}
                </a>
              </Button>
            ) : null}
            <Button asChild variant="ghost" className="h-12 w-full text-base">
              <Link to="/">Til rørlageret</Link>
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Søk eller skann, legg rørene i bestillingen, og hent dem på lageret. Du får e-post når de er klare.
            </p>

            <div className="relative mt-4">
              <label htmlFor="sok-bestill" className="sr-only">
                Søk etter rør
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="sok-bestill"
                type="search"
                inputMode="search"
                autoComplete="off"
                value={sok}
                onChange={(e) => setSok(e.target.value)}
                placeholder="Søk på navn eller varenr."
                className={cn("h-14 pl-11 text-base", sok ? "pr-24" : "pr-14")}
              />
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {sok ? (
                  <button
                    type="button"
                    onClick={() => setSok("")}
                    aria-label="Tøm søket"
                    className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSkannar(true)}
                  aria-label="Skann QR-kode eller strekkode"
                  className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setKategori(null)}
                  aria-pressed={kategori === null}
                  className={cn(
                    "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                    kategori === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  Alle
                </button>
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setKategori(kategori === c.id ? null : c.id)}
                    aria-pressed={kategori === c.id}
                    className={cn(
                      "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                      kategori === c.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              {katalog.isLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-lg" />
                  ))}
                </div>
              ) : katalog.isError ? (
                <div className="hm-card p-6 text-center">
                  <p className="font-semibold text-foreground">Klarte ikke å hente varene</p>
                  <p className="mt-1 text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
                  <Button variant="outline" className="mt-4 h-12" onClick={() => katalog.refetch()}>
                    Prøv igjen
                  </Button>
                </div>
              ) : synlege.length === 0 ? (
                <div className="hm-card flex flex-col items-center gap-2 p-8 text-center">
                  <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <p className="font-semibold text-foreground">Ingen rør passer søket</p>
                  <p className="text-sm text-muted-foreground">Prøv et annet ord, eller skann koden.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {synlege.map((vare) => (
                    <VareKort key={vare.id} vare={vare} vat={vat} onVelg={setValt} />
                  ))}
                </div>
              )}
            </div>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Står du ved hylla og tar ut selv?{" "}
              <Link to="/" className="font-medium text-foreground underline underline-offset-2">
                Gå til selvbetjent uttak
              </Link>
            </p>
          </>
        )}
      </main>

      <LegalFooter />

      <Scanner open={skannar} onOpenChange={setSkannar} onCode={onKode} />

      <Dialog open={valt !== null} onOpenChange={(o) => !o && setValt(null)}>
        <DialogContent className="max-w-md">
          {valt ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{pipeLabel(valt.name, valt.dimension)}</DialogTitle>
                <DialogDescription>
                  {[valt.category_name, valt.sku ? `Varenr. ${valt.sku}` : null].filter(Boolean).join(" · ") ||
                    "Legg i bestillingen"}
                </DialogDescription>
              </DialogHeader>
              {/* key: ny vare, blankt ark – mengda frå førre vare skal ikkje henge att */}
              <LeggTil key={valt.id} vare={valt} vat={vat} telefon={telefon} onFerdig={() => setValt(null)} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {open ? <PickupCartBar /> : null}
    </div>
  );
}
