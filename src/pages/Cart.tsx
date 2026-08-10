import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, ShoppingCart, Trash2 } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { QuantityInput } from "@/components/QuantityInput";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCart } from "@/lib/cart";
import { useSettings } from "@/lib/settings";
import { kr, num, pipeLabel } from "@/lib/format";

export default function Cart() {
  const navigate = useNavigate();
  const cart = useCart();
  const { data: settings } = useSettings();

  // Ein sum som ikkje er heile sanninga er verre enn ingen sum
  const showTotal = (settings?.show_prices ?? true) && !cart.hasUnpriced;

  if (cart.count === 0) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Handlekurv" back="/" />
        <main className="mx-auto max-w-2xl px-3 pt-6 sm:px-4">
          <div className="hm-card animate-fade-in flex flex-col items-center gap-3 p-8 text-center">
            <ShoppingCart className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Kurven er tom</h2>
            <p className="text-sm text-muted-foreground">
              Skann QR-koden på hylla eller søk opp røret for å legge det inn.
            </p>
            <Button asChild className="mt-2 h-14 w-full text-base font-semibold">
              <Link to="/">Til rørlista</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Handlekurv" subtitle={`${cart.count} ${cart.count === 1 ? "vare" : "varer"}`} back="/" />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-8 sm:px-4">
        <ul className="space-y-3">
          {cart.lines.map((line) => (
            <li key={line.pipe_type_id} className="hm-card animate-fade-in p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold leading-tight text-foreground break-words">
                    {pipeLabel(line.name, line.dimension)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    {line.sku ? <span>Varenr. {line.sku}</span> : null}
                    {line.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {line.location}
                      </span>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cart.remove(line.pipe_type_id)}
                  aria-label={`Fjern ${pipeLabel(line.name, line.dimension)} fra kurven`}
                  className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3">
                {/* Tom presets-liste gir den kompakte utgåva: berre +/– og tal.
                    Halvskrivne verdiar (tomt felt eller 0) blir ikkje lagra, så
                    linja held på mengda si til kunden har tasta noko ferdig. */}
                <QuantityInput
                  value={line.quantity}
                  onChange={(v) => {
                    if (v !== null && v > 0) cart.setQuantity(line.pipe_type_id, v);
                  }}
                  unit={line.unit}
                  presets={[]}
                />
              </div>

              {(settings?.show_prices ?? true) ? (
                <p className="tabular mt-3 text-right text-sm text-muted-foreground">
                  {line.price === null ? (
                    "Pris avtales"
                  ) : (
                    <>
                      {num(line.quantity)} {line.unit} × {kr(line.price)} kr ={" "}
                      <span className="font-semibold text-foreground">{kr(line.price * line.quantity)} kr</span>
                    </>
                  )}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {showTotal ? (
          <div className="hm-card mt-4 flex items-center justify-between gap-4 p-4">
            <span className="text-base font-semibold text-foreground">Sum</span>
            <span className="tabular text-2xl font-bold text-foreground">{kr(cart.total)} kr</span>
          </div>
        ) : null}

        <Button
          className="mt-4 h-16 w-full text-lg font-semibold [&_svg]:size-6"
          onClick={() => navigate("/kasse")}
        >
          Gå videre
          <ArrowRight aria-hidden="true" />
        </Button>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="h-12 flex-1 text-base">
            <Link to="/">Legg til flere rør</Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="h-12 flex-1 text-base text-muted-foreground [&_svg]:size-5">
                <Trash2 aria-hidden="true" />
                Tøm handlekurv
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tømme handlekurven?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle {cart.count} {cart.count === 1 ? "varen" : "varene"} blir fjernet. Dette kan ikke angres.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-12">Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  className="h-12 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => cart.clear()}
                >
                  Tøm kurven
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  );
}
