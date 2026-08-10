import { ORDER_STATUS_LABEL, type OrderStatus, type StockStatus } from "@/lib/types";
import { STOCK_LABEL } from "@/lib/stock";
import { cn } from "@/lib/utils";

// Dempa flate med farga tekst: chipen skal lesast raskt utan å skrike i lista.
// Gul på kvitt har for dårleg kontrast, difor eigen --warning-ink til teksten.
const ORDER_STYLE: Record<OrderStatus, string> = {
  ny: "bg-primary/10 text-primary border border-primary/25",
  behandlet: "bg-warning/15 text-warning-ink border border-warning/30",
  levert: "bg-success/15 text-success border border-success/30",
  avvist: "bg-muted text-muted-foreground border border-border",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn("hm-chip", ORDER_STYLE[status] ?? ORDER_STYLE.ny)}>{ORDER_STATUS_LABEL[status] ?? status}</span>;
}

const STOCK_STYLE: Record<StockStatus, string> = {
  tomt: "bg-destructive/15 text-destructive border border-destructive/30",
  snart: "bg-warning/15 text-warning-ink border border-warning/30",
  pa_lager: "bg-success/15 text-success border border-success/30",
};

export function StockBadge({ status }: { status: StockStatus }) {
  return <span className={cn("hm-chip", STOCK_STYLE[status] ?? STOCK_STYLE.pa_lager)}>{STOCK_LABEL[status] ?? status}</span>;
}
