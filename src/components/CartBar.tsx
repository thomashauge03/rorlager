import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useSettings } from "@/lib/settings";
import { kr, qtyLabel } from "@/lib/format";

type CartBarProps = {
  label?: string;
  to?: string;
};

export function CartBar({ label = "Se kurven", to = "/kurv" }: CartBarProps) {
  const navigate = useNavigate();
  const { lines, count, total, hasUnpriced } = useCart();
  const { data: settings } = useSettings();

  const showTotal = (settings?.show_prices ?? true) && !hasUnpriced;

  /** Utan sum er mengda det einaste som seier noko. Ho blir summert per eining
   *  ("24 m · 3 stk") og alltid vist med eining, så ingen les henne som kroner. */
  const quantitySummary = useMemo(() => {
    const perUnit = new Map<string, number>();
    for (const l of lines) perUnit.set(l.unit, (perUnit.get(l.unit) ?? 0) + l.quantity);
    return [...perUnit].map(([unit, q]) => qtyLabel(Math.round(q * 100) / 100, unit)).join(" · ");
  }, [lines]);

  // Tom kurv treng ingen linje – då skal heile skjermen vere til lista
  if (count === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur px-3 pt-3"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {count} {count === 1 ? "vare" : "varer"}
          </p>
          <p className="text-sm text-muted-foreground tabular truncate">
            {showTotal ? `${kr(total)} kr` : quantitySummary}
          </p>
        </div>
        <Button className="h-12 px-6 text-base font-semibold shrink-0" onClick={() => navigate(to)}>
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {label}
        </Button>
      </div>
    </div>
  );
}
