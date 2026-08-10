import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Download, Home, Info } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/lib/settings";
import { downloadOrderPDF } from "@/lib/order-pdf";
import type { CompanyInfo } from "@/lib/order-pdf";
import { dateTime, kr, num, pipeLabel } from "@/lib/format";
import type { PipeOrderLineRow, PipeOrderRow, SubmittedOrder } from "@/lib/types";
import { LAST_ORDER_KEY } from "@/lib/cart";

/** Ei halvskriven eller framand sessionStorage-verdi skal ikkje velte sida */
function isSubmittedOrder(v: unknown): v is SubmittedOrder {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.order_number === "number" && Array.isArray(o.lines);
}

function readStoredOrder(): SubmittedOrder | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSubmittedOrder(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function Receipt() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: settings } = useSettings();

  const fromState = (location.state as { order?: unknown } | null)?.order;
  const [order] = useState<SubmittedOrder | null>(() =>
    isSubmittedOrder(fromState) ? fromState : readStoredOrder(),
  );

  useEffect(() => {
    if (!order) {
      navigate("/", { replace: true });
      return;
    }
    // Reserva har gjort jobben sin når ordren ligg i state. Blir ho ståande, møter
    // neste kunde på den delte lagertelefonen førre uttak med namn og mengder.
    try {
      sessionStorage.removeItem(LAST_ORDER_KEY);
    } catch {
      /* privat modus – då vart nøkkelen aldri skriven heller */
    }
  }, [order, navigate]);

  const pricesOn = settings?.show_prices ?? true;
  const hasUnpriced = order?.lines?.some((l) => l.unit_price === null) ?? false;
  const showPrices = pricesOn && (order?.lines?.some((l) => l.unit_price !== null) ?? false);
  // Databasen hoppar over linjer utan pris når totalen blir rekna ut, så ein sum
  // med slike linjer i ville vore lågare enn det kunden faktisk tek med seg
  const showTotal = pricesOn && !hasUnpriced;

  const company: CompanyInfo = useMemo(
    () => ({
      name: settings?.company_name || "Hauge Maskin AS",
      orgNumber: settings?.org_number,
      address: settings?.address,
      phone: settings?.phone,
      email: settings?.email,
    }),
    [settings],
  );

  if (!order) return null;

  const handlePdf = () => {
    try {
      // PDF-en tek ei databaserad; svaret frå RPC-en har berre det kunden treng,
      // så resten blir fylt med nøytrale verdiar. Utskrifta ser ikkje skilnad.
      const orderRow: PipeOrderRow = {
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        updated_at: order.created_at,
        customer_name: order.customer_name,
        customer_phone: null,
        customer_email: null,
        company: order.company,
        project: order.project,
        comment: order.comment,
        signature: null,
        status: "ny",
        total: order.total,
        handled_by: null,
        handled_at: null,
        admin_note: null,
        invoice_id: null,
      };

      const lines: PipeOrderLineRow[] = order.lines.map((l, i) => ({
        id: "",
        order_id: "",
        pipe_type_id: null,
        name: l.name,
        dimension: l.dimension,
        sku: l.sku,
        unit: l.unit,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.line_total,
        sort_order: i,
      }));

      downloadOrderPDF({ order: orderRow, lines, company }, { showPrices });
    } catch {
      toast({
        title: "Klarte ikke å lage PDF",
        description: "Prøv igjen, eller ta et skjermbilde av kvitteringen.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Kvittering" />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-10 sm:px-4">
        <div className="animate-scale-in rounded-lg border border-success/30 bg-success/10 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold text-foreground">Uttaket er registrert</h2>
          <p className="tabular mt-1 text-sm text-muted-foreground">
            Uttak nr. <span className="font-semibold text-foreground">{order.order_number}</span> ·{" "}
            {dateTime(order.created_at)}
          </p>
        </div>

        <section className="hm-card mt-4 p-4" aria-labelledby="varer">
          <h3 id="varer" className="text-base font-semibold text-foreground">
            Varer
          </h3>
          <ul className="mt-3 divide-y divide-border">
            {order.lines.map((line, i) => (
              <li key={`${line.sku ?? line.name}-${i}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-medium text-foreground break-words">
                    {pipeLabel(line.name, line.dimension)}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-foreground">
                    {num(line.quantity)} {line.unit}
                  </span>
                </div>
                {showPrices && line.line_total !== null ? (
                  <p className="tabular mt-0.5 text-right text-xs text-muted-foreground">
                    {kr(line.line_total)} kr
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          {showTotal ? (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-base font-semibold text-foreground">Sum</span>
              <span className="tabular text-2xl font-bold text-foreground">{kr(order.total)} kr</span>
            </div>
          ) : pricesOn && hasUnpriced ? (
            <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
              Noen varer har ikke pris – avtales med lageret.
            </p>
          ) : null}
        </section>

        {(order.company || order.project || order.comment) && (
          <section className="hm-card mt-4 divide-y divide-border p-4">
            {order.company ? (
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="text-sm text-muted-foreground">Firma</span>
                <span className="text-right text-sm font-medium text-foreground">{order.company}</span>
              </div>
            ) : null}
            {order.project ? (
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="text-sm text-muted-foreground">Prosjekt</span>
                <span className="text-right text-sm font-medium text-foreground">{order.project}</span>
              </div>
            ) : null}
            {order.comment ? (
              <div className="flex items-baseline justify-between gap-4 py-1.5">
                <span className="text-sm text-muted-foreground">Kommentar</span>
                <span className="text-right text-sm font-medium text-foreground">{order.comment}</span>
              </div>
            ) : null}
          </section>
        )}

        {settings?.pickup_note ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted-foreground">{settings.pickup_note}</p>
          </div>
        ) : null}

        <div className="mt-5 space-y-2">
          <Button variant="outline" className="h-14 w-full text-base [&_svg]:size-5" onClick={handlePdf}>
            <Download aria-hidden="true" />
            Last ned PDF
          </Button>
          <Button asChild className="h-16 w-full text-lg font-semibold [&_svg]:size-6">
            <Link to="/">
              <Home aria-hidden="true" />
              Nytt uttak
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
