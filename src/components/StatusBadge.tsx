import {
  DEVIATION_LABEL,
  ORDER_STATUS_LABEL,
  PROJECT_ORDER_STATUS_LABEL,
  type Deviation,
  type OrderStatus,
  type ProjectOrderStatus,
  type StockStatus,
} from "@/lib/types";
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

// Prosjektbestillingar har fleire steg enn uttaka, og «delvis» er det viktigaste
// av dei: noko står framleis ute hos leverandøren.
const PROJECT_STYLE: Record<ProjectOrderStatus, string> = {
  meldt: "bg-primary/10 text-primary border border-primary/25",
  bestilt: "bg-warning/15 text-warning-ink border border-warning/30",
  delvis: "bg-warning/15 text-warning-ink border border-warning/30",
  mottatt: "bg-success/15 text-success border border-success/30",
  avvist: "bg-muted text-muted-foreground border border-border",
};

export function ProjectStatusBadge({ status }: { status: ProjectOrderStatus }) {
  return (
    <span className={cn("hm-chip", PROJECT_STYLE[status] ?? PROJECT_STYLE.meldt)}>
      {PROJECT_ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

const DEVIATION_STYLE: Record<Deviation, string> = {
  ingen: "bg-success/15 text-success border border-success/30",
  mangler: "bg-destructive/15 text-destructive border border-destructive/30",
  skadet: "bg-destructive/15 text-destructive border border-destructive/30",
  feil_vare: "bg-destructive/15 text-destructive border border-destructive/30",
  for_mye: "bg-warning/15 text-warning-ink border border-warning/30",
};

export function DeviationBadge({ deviation }: { deviation: Deviation }) {
  return (
    <span className={cn("hm-chip", DEVIATION_STYLE[deviation] ?? DEVIATION_STYLE.ingen)}>
      {DEVIATION_LABEL[deviation] ?? deviation}
    </span>
  );
}
