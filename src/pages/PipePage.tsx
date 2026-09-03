import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Home, Plus, Search, ShoppingCart, WifiOff } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CartBar } from "@/components/CartBar";
import { StockBadge } from "@/components/StatusBadge";
import { QuantityInput } from "@/components/QuantityInput";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QK, fetchPipeTypeBySlug } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import { stockStatus } from "@/lib/stock";
import { cartLineFromType, useCart } from "@/lib/cart";
import { kr, num, pipeLabel, qtyLabel } from "@/lib/format";

/** Ei rad med etikett og verdi. Tomme felt blir hoppa over – "–" seier ingenting. */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

export default function PipePage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const cart = useCart();

  const [quantity, setQuantity] = useState<number | null>(null);

  // Nøkkelen ligg under QK.types med vilje: då treffer invalideringane etter
  // lagerendring denne sida òg, og kunden ser same beholdning som framsida
  const pipeQuery = useQuery({
    queryKey: QK.bySlug(slug ?? ""),
    queryFn: () => fetchPipeTypeBySlug(slug),
    enabled: Boolean(slug),
  });

  const pipe = pipeQuery.data ?? null;
  const showPrices = settings?.show_prices ?? true;

  // Ny skanning skal starte på blankt ark, ikkje arve mengda frå førre rør
  useEffect(() => {
    setQuantity(null);
  }, [slug]);

  const inCart = useMemo(
    () => (pipe ? cart.lines.find((l) => l.pipe_type_id === pipe.id) ?? null : null),
    [cart.lines, pipe],
  );

  const alleredeIKurven = inCart?.quantity ?? 0;
  // Kurven blir henta ut den òg, så åtvaringa må sjå det samla uttaket.
  // Avrunding fordi desimalmeter elles gir 12.299999999999999 i teksten.
  const samlaUttak = Math.round(((quantity ?? 0) + alleredeIKurven) * 100) / 100;
  const overStock = Boolean(pipe && quantity !== null && quantity > 0 && samlaUttak > pipe.stock);

  const addToCart = (thenGoToCart: boolean) => {
    if (!pipe || quantity === null || quantity <= 0) {
      toast.error("Skriv inn hvor mye du tar ut");
      return;
    }
    cart.add(cartLineFromType(pipe, quantity));
    toast.success(`${qtyLabel(quantity, pipe.unit)} ${pipeLabel(pipe.name, pipe.dimension)} lagt i kurven`);
    // Rett tilbake til framsida: neste hylle er som regel eitt skann unna
    navigate(thenGoToCart ? "/kurv" : "/");
  };

  /* ---------- Lastar ---------- */
  if (pipeQuery.isLoading) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Rørlager" back="/" showCart />
        <main className="mx-auto max-w-2xl space-y-4 px-3 pt-4 pb-36 sm:px-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  /* ---------- Henting feila ---------- */
  // Skilt frå "ukjend kode": ved dårleg dekning i lageret er det ingenting
  // gale med etiketten, og kunden skal få prøve på nytt i staden for å gi opp
  if (pipeQuery.isError) {
    const detalj = pipeQuery.error instanceof Error ? pipeQuery.error.message.trim() : "";
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Rørlager" back="/" showCart />
        <main className="mx-auto max-w-2xl px-3 pt-6 pb-36 sm:px-4">
          <div className="hm-card animate-fade-in flex flex-col items-center gap-3 p-8 text-center">
            <WifiOff className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Klarte ikke å hente røret</h2>
            <p className="text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
            {detalj ? <p className="text-xs text-muted-foreground break-words">{detalj}</p> : null}
            <Button variant="outline" className="mt-2 h-12 w-full text-base" onClick={() => pipeQuery.refetch()}>
              Prøv igjen
            </Button>
            <Button asChild variant="ghost" className="h-12 w-full text-base text-muted-foreground [&_svg]:size-5">
              <Link to="/">
                <Home aria-hidden="true" />
                Tilbake til oversikten
              </Link>
            </Button>
          </div>
        </main>
        <CartBar />
      </div>
    );
  }

  /* ---------- Ukjend kode ---------- */
  if (!pipe) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Rørlager" back="/" showCart />
        <main className="mx-auto max-w-2xl px-3 pt-6 pb-36 sm:px-4">
          <div className="hm-card animate-fade-in flex flex-col items-center gap-3 p-8 text-center">
            <Search className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Fant ikke røret</h2>
            <p className="text-sm text-muted-foreground">
              Koden <span className="font-semibold text-foreground">{slug}</span> er ikke registrert. Etiketten kan
              være gammel. Søk opp røret på forsiden, eller si fra til lageret.
            </p>
            <Button asChild className="mt-2 h-12 w-full text-base">
              <Link to="/">
                <Search className="h-5 w-5" aria-hidden="true" />
                Søk i rørlista
              </Link>
            </Button>
          </div>
        </main>
        <CartBar />
      </div>
    );
  }

  /* ---------- Røret ---------- */
  const status = stockStatus(pipe);

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Rørlager" back="/" showCart />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-36 sm:px-4">
        <div className="animate-fade-in space-y-4">
          {/* Overskrift */}
          <div className="hm-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {pipe.category_name ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">{pipe.category_name}</p>
                ) : null}
                <h2 className="mt-0.5 text-2xl font-bold leading-tight text-foreground break-words sm:text-3xl">
                  {pipe.name}
                </h2>
                {pipe.dimension ? (
                  <p className="text-xl font-semibold text-muted-foreground">{pipe.dimension}</p>
                ) : null}
              </div>
              <StockBadge status={status} />
            </div>

            {pipe.description ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{pipe.description}</p>
            ) : null}

            <div className="mt-3 divide-y divide-border border-t border-border">
              <Fact label="Varenummer" value={pipe.sku} />
              <Fact label="Hylleplass" value={pipe.location} />
              <Fact label="På lager" value={`${num(pipe.stock)} ${pipe.unit}`} />
              {showPrices ? (
                <Fact
                  label={pipe.unit === "m" ? "Pris per meter" : "Pris per stk"}
                  value={pipe.price === null ? "Avtales" : `${kr(pipe.price)} kr`}
                />
              ) : null}
            </div>
          </div>

          {/* Mengde */}
          <div className="hm-card p-4">
            <h3 className="mb-3 text-base font-semibold text-foreground">
              Hvor mye tar du ut?
            </h3>
            <QuantityInput value={quantity} onChange={setQuantity} unit={pipe.unit} autoFocus />

            {inCart ? (
              <p className="tabular mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Du har allerede {qtyLabel(inCart.quantity, pipe.unit)} av denne i kurven.
              </p>
            ) : null}

            {/* Åtvaring, ikkje sperre: beholdninga i basen er ikkje alltid heilt fersk */}
            {overStock ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/15 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
                <p className="tabular text-sm text-warning-ink">
                  {alleredeIKurven > 0 ? (
                    <>
                      Sammen med {qtyLabel(alleredeIKurven, pipe.unit)} i kurven blir dette{" "}
                      {qtyLabel(samlaUttak, pipe.unit)}, men det er bare {num(pipe.stock)} {pipe.unit} registrert på
                      lager.
                    </>
                  ) : (
                    <>Det er bare {num(pipe.stock)} {pipe.unit} registrert på lager.</>
                  )}{" "}
                  Du kan fortsatt ta ut mer, men si fra til lageret.
                </p>
              </div>
            ) : null}

            {showPrices && pipe.price !== null && quantity !== null && quantity > 0 ? (
              <p className="tabular mt-3 text-right text-sm text-muted-foreground">
                Sum: <span className="font-semibold text-foreground">{kr(pipe.price * quantity)} kr</span>
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Button
              className="h-16 w-full text-lg font-semibold [&_svg]:size-6"
              disabled={quantity === null || quantity <= 0}
              onClick={() => addToCart(false)}
            >
              <Plus aria-hidden="true" />
              Legg i handlekurv
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full text-base [&_svg]:size-5"
              disabled={quantity === null || quantity <= 0}
              onClick={() => addToCart(true)}
            >
              <ShoppingCart aria-hidden="true" />
              Legg til og gå til kurv
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button asChild variant="ghost" className="h-12 w-full text-base text-muted-foreground [&_svg]:size-5">
              <Link to="/">
                <Home aria-hidden="true" />
                Tilbake til oversikten
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <CartBar />
    </div>
  );
}
