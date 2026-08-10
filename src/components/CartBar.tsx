import { useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { kr } from "@/lib/format";

type CartBarProps = {
  label?: string;
  to?: string;
};

export function CartBar({ label = "Se kurven", to = "/kurv" }: CartBarProps) {
  const navigate = useNavigate();
  const { count, total, hasUnpriced } = useCart();

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
            {hasUnpriced ? "Pris avtales" : `${kr(total)} kr`}
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
