// Bestillinga slik kunden ser henne: status, heile bestillinga og PDF-en. Same
// side som e-posten lenkjer til. Id-en i adressa er ein uuid – ordrenummera går
// i rekkjefølgje, og med dei kunne kven som helst bladd gjennom andre sine.

import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock, Download, Info, PackageCheck, Plus, Search, WifiOff } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { fetchPickupOrder, requestEmails, type PickupOrder as Bestilling } from "@/lib/pickup-orders";
import { downloadPickupPDF } from "@/lib/pickup-pdf";
import { prisInklMva, summer } from "@/lib/mva";
import { visOrgnr } from "@/lib/orgnr";
import { ANGRERETT_KORT, selgerFra } from "@/lib/vilkar";
import { dateTime, kr, longDate, num, pipeLabel } from "@/lib/format";
import type { CompanyInfo } from "@/lib/order-pdf";
import { cn } from "@/lib/utils";

const STATUS = {
  ny: { Ikon: Clock, tittel: "Venter på godkjenning", ramme: "border-primary/30 bg-primary/10", farge: "text-primary" },
  behandlet: { Ikon: PackageCheck, tittel: "Klar til henting", ramme: "border-success/30 bg-success/10", farge: "text-success" },
  levert: { Ikon: CheckCircle2, tittel: "Hentet", ramme: "border-success/30 bg-success/10", farge: "text-success" },
  avvist: {
    Ikon: Ban,
    tittel: "Bestillingen ble avvist",
    ramme: "border-destructive/30 bg-destructive/10",
    farge: "text-destructive",
  },
} as const;

function statusTekst(o: Bestilling): string {
  switch (o.status) {
    case "ny":
      return o.pickup_now
        ? "Bestillingen er mottatt. Kontoret har fått beskjed om at du henter nå. Siden oppdaterer seg når bestillingen er godkjent."
        : "Bestillingen er mottatt. Kontoret går gjennom bestillingen. Du får e-post når den er klar til henting.";
    case "behandlet":
      return o.pickup_now ? "Du kan hente nå." : `Du kan hente ${longDate(o.pickup_date)}.`;
    case "levert":
      return "Takk for handelen.";
    case "avvist":
      return o.customer_message ?? "Ta kontakt med oss hvis du lurer på noe.";
  }
}

function Rad({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function PickupOrder() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const { data: orderSettings } = useOrderSettings();

  const q = useQuery({
    queryKey: QK.pickupOrder(id),
    queryFn: () => fetchPickupOrder(id),
    // Står kunden på lageret og ventar, ser han «Klar til henting» kome opp utan
    // å laste sida på nytt. Berre medan fana er synleg.
    refetchInterval: (query) => (query.state.data?.status === "ny" ? 20_000 : false),
    refetchIntervalInBackground: false,
  });
  const o = q.data ?? null;

  /*
   * Ber om det som står att av e-post, éin gong per status. Gjekk førespurnaden
   * frå kassen tapt – dekninga forsvann i det knappen blei trykt – går e-posten
   * no, og kontoret får beskjed likevel.
   */
  const status = o?.status;
  const spurt = useRef<string | null>(null);
  const { refetch } = q;
  useEffect(() => {
    if (!id || !status) return;
    const nokkel = `${id}:${status}`;
    if (spurt.current === nokkel) return;
    spurt.current = nokkel;
    void requestEmails(id).then((r) => {
      if (r?.sendt.length) void refetch();
    });
  }, [id, status, refetch]);

  const vat = settings?.vat_rate ?? 25;
  const company: CompanyInfo = {
    name: settings?.company_name || "Hauge Maskin AS",
    orgNumber: settings?.org_number,
    address: settings?.address,
    phone: settings?.phone,
    email: settings?.email,
  };
  const selger = selgerFra(settings, orderSettings);

  const pdf = () => {
    if (!o) return;
    try {
      downloadPickupPDF({ order: o, company, selger, vatRate: vat });
    } catch {
      toast({
        title: "Klarte ikke å lage PDF",
        description: "Prøv igjen, eller ta et skjermbilde av bestillingen.",
        variant: "destructive",
      });
    }
  };

  if (q.isLoading) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" />
        <main className="mx-auto max-w-2xl space-y-3 px-3 pt-4 sm:px-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (q.isError && !o) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" />
        <main className="mx-auto max-w-lg px-3 pt-6 sm:px-4">
          <div className="hm-card flex flex-col items-center gap-3 p-8 text-center">
            <WifiOff className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Klarte ikke å hente bestillingen</h2>
            <p className="text-sm text-muted-foreground">Sjekk at du har dekning, og prøv igjen.</p>
            <Button variant="outline" className="h-12 w-full text-base" onClick={() => q.refetch()}>
              Prøv igjen
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (!o) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" />
        <main className="mx-auto max-w-lg px-3 pt-6 sm:px-4">
          <div className="hm-card flex flex-col items-center gap-3 p-8 text-center">
            <Search className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Fant ikke bestillingen</h2>
            <p className="text-sm text-muted-foreground">
              Lenken kan være ufullstendig. Åpne den fra e-posten på nytt, eller ta kontakt med oss.
            </p>
            <Button asChild className="h-12 w-full text-base">
              <Link to="/bestill">Til butikken</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const s = STATUS[o.status];
  const privat = o.customer_type === "privat";
  const sum = summer([o.total], vat);

  return (
    <div className="hm-page min-h-screen">
      <TopBar title={`Bestilling nr. ${o.order_number}`} />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-10 sm:px-4">
        <div aria-live="polite" className={cn("animate-scale-in rounded-lg border p-6 text-center", s.ramme)}>
          <s.Ikon className={cn("mx-auto h-12 w-12", s.farge)} aria-hidden="true" />
          <h2 className="mt-3 text-2xl font-bold text-foreground">{s.tittel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{statusTekst(o)}</p>
          <p className="tabular mt-2 text-xs text-muted-foreground">
            Bestilling nr. <span className="font-semibold text-foreground">{o.order_number}</span> · {dateTime(o.created_at)}
          </p>
        </div>

        {o.emails.kvittering ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Vi har sendt kvittering til <span className="font-medium text-foreground">{o.customer_email}</span>.
          </p>
        ) : null}

        {o.customer_message && o.status !== "avvist" ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-foreground">
              <span className="font-semibold">Melding fra oss:</span> {o.customer_message}
            </p>
          </div>
        ) : null}

        <section className="hm-card mt-4 p-4" aria-labelledby="bestilling-varer">
          <h3 id="bestilling-varer" className="text-base font-semibold text-foreground">
            Varer <span className="text-sm font-normal text-muted-foreground">({privat ? "inkl. mva" : "eks. mva"})</span>
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {o.lines.map((l, i) => (
              <li key={`${l.sku ?? l.name}-${i}`} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium text-foreground">{pipeLabel(l.name, l.dimension)}</span>
                  <span className="tabular shrink-0 text-sm font-semibold text-foreground">
                    {num(l.quantity)} {l.unit}
                  </span>
                </div>
                {l.unit_price !== null && l.line_total !== null ? (
                  <p className="tabular mt-0.5 text-right text-xs text-muted-foreground">
                    {kr(privat ? prisInklMva(l.unit_price, vat) : l.unit_price)} kr/{l.unit} ·{" "}
                    {kr(privat ? summer([l.line_total], vat).inkl : l.line_total)} kr
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sum eks. mva</dt>
              <dd className="tabular">{kr(sum.eks)} kr</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Mva {num(vat)} %</dt>
              <dd className="tabular">{kr(sum.mva)} kr</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-base font-semibold text-foreground">Sum inkl. mva</dt>
              <dd className="tabular text-xl font-bold text-foreground">{kr(sum.inkl)} kr</dd>
            </div>
          </dl>
        </section>

        <section className="hm-card mt-4 divide-y divide-border p-4">
          <Rad label="Hentes" value={o.pickup_now ? `Henter nå – ${longDate(o.pickup_date)}` : longDate(o.pickup_date)} />
          <Rad label="Hentested" value={selger.adresse ? `Lageret, ${selger.adresse}` : "Lageret"} />
          <Rad label="Henting" value={selger.henteinfo} />
          <Rad label="Betaling" value={`Faktura, ${selger.betalingsfrist} dager`} />
          {privat ? (
            <>
              <Rad label="Navn" value={o.customer_name} />
              <Rad label="Fakturaadresse" value={o.billing_address} />
            </>
          ) : (
            <>
              <Rad label="Firma" value={o.company} />
              <Rad label="Org.nr." value={o.org_number ? visOrgnr(o.org_number) : null} />
              <Rad label="Kontaktperson" value={o.customer_name} />
            </>
          )}
          <Rad label="Telefon" value={o.customer_phone} />
          <Rad label="E-post" value={o.customer_email} />
          <Rad label="Kommentar" value={o.comment} />
        </section>

        {privat && o.status !== "avvist" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {ANGRERETT_KORT.join(" ")}{" "}
            <Link to="/vilkar" className="font-medium text-foreground underline underline-offset-2">
              Vilkår og angreskjema
            </Link>
          </p>
        ) : null}

        <div className="mt-5 space-y-2">
          <Button variant="outline" className="h-14 w-full text-base [&_svg]:size-5" onClick={pdf}>
            <Download aria-hidden="true" />
            Last ned PDF
          </Button>
          <Button asChild className="h-14 w-full text-base font-semibold [&_svg]:size-5">
            <Link to="/bestill">
              <Plus aria-hidden="true" />
              Ny bestilling
            </Link>
          </Button>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
