import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { kr } from "@/lib/format";
import { summer } from "@/lib/mva";
import { usePickupCart } from "@/lib/pickup-cart";
import { useSettings } from "@/lib/settings";

/** Stripa nedst i butikken. Summen står inkl. mva: kunden har ikkje valt enno. */
export function PickupCartBar() {
  const navigate = useNavigate();
  const { count, eks } = usePickupCart();
  const { data: settings } = useSettings();

  if (count === 0) return null;
  const { inkl } = summer([eks], settings?.vat_rate ?? 25);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-3 pt-3 backdrop-blur"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {count} {count === 1 ? "vare" : "varer"}
          </p>
          <p className="tabular truncate text-sm text-muted-foreground">{kr(inkl)} kr inkl. mva</p>
        </div>
        <Button className="h-12 shrink-0 px-6 text-base font-semibold" onClick={() => navigate("/bestill/kasse")}>
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          Til bestilling
        </Button>
      </div>
    </div>
  );
}
