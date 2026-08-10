import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import hmLogo from "@/assets/hm-logo.png";
import { useCart } from "@/lib/cart";

type TopBarProps = {
  title?: string;
  subtitle?: string;
  /** true gir navigate(-1); ein streng navigerer til den ruta */
  back?: boolean | string;
  showCart?: boolean;
  right?: ReactNode;
};

export function TopBar({ title = "Rørlager", subtitle, back, showCart, right }: TopBarProps) {
  const navigate = useNavigate();
  const { count } = useCart();

  const goBack = () => {
    if (typeof back === "string") navigate(back);
    else navigate(-1);
  };

  return (
    <header className="hm-topbar sticky top-0 z-40">
      {/* Telefonar med hakk: innhaldet må startast under statuslinja */}
      <div className="pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
          {back ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Tilbake"
              className="h-11 w-11 -ml-1 shrink-0 rounded-md flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}

          <span className="hm-logo-badge">
            <img src={hmLogo} alt="Hauge Maskin" className="h-7 w-auto" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">{title}</h1>
            {subtitle ? <p className="text-xs text-white/60 truncate">{subtitle}</p> : null}
          </div>

          {showCart ? (
            <Link
              to="/kurv"
              aria-label={count > 0 ? `Handlekurv, ${count} ${count === 1 ? "vare" : "varer"}` : "Handlekurv, tom"}
              className="relative h-11 w-11 shrink-0 rounded-md flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-primary text-primary-foreground text-[0.7rem] font-bold leading-[1.15rem] text-center tabular"
                >
                  {count}
                </span>
              )}
            </Link>
          ) : null}

          {right ? <div className="shrink-0 flex items-center gap-2">{right}</div> : null}
        </div>
      </div>
    </header>
  );
}
