// Fakturagrunnlag: samlar ufakturerte bestillingar for éin kunde i ein periode,
// og lagar eit PDF-grunnlag som kan sendast vidare til rekneskapen.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  FileDown,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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

import { useToast } from "@/hooks/use-toast";
import { isoDate, kr, krShort, num, pipeLabel, shortDate } from "@/lib/format";
import { QK, createInvoice, deleteInvoice, fetchInvoices, fetchOrders } from "@/lib/orders";
import { buildInvoicePDF, downloadInvoicePDF, type InvoiceDoc } from "@/lib/invoice-pdf";
import type { CompanyInfo } from "@/lib/order-pdf";
import { useSettings } from "@/lib/settings";
import type { OrderWithLines, PipeInvoiceRow, PipeSettingsRow } from "@/lib/types";

/** Same kunde kan vere skriven "Ola  Nordmann" og "ola nordmann". Vi grupperer
 *  på ein normalisert nøkkel, men viser namnet slik det sist blei skrive. */
const nameKey = (n: string | null | undefined) => (n ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Bestillingar er tidsstempla, men perioden er datoar – lokal dato, ikkje UTC. */
const orderDay = (o: OrderWithLines) => isoDate(new Date(o.created_at));

/** Ei linje utan pris kan ikkje summerast, og må seiast frå om */
const missingPrice = (l: { unit_price: number | null; line_total: number | null }) =>
  l.unit_price === null || l.unit_price === undefined || l.line_total === null || l.line_total === undefined;

const companyFrom = (s: PipeSettingsRow): CompanyInfo => ({
  name: s?.company_name || "Hauge Maskin AS",
  orgNumber: s?.org_number ?? null,
  address: s?.address ?? null,
  phone: s?.phone ?? null,
  email: s?.email ?? null,
});

/** Bestillingane slik PDF-en vil ha dei */
const toPdfOrders = (orders: OrderWithLines[]) =>
  [...orders]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((o) => ({
      order_number: o.order_number,
      created_at: o.created_at,
      project: o.project,
      comment: o.comment,
      signature: o.signature,
      lines: o.lines ?? [],
    }));

type CustomerGroup = {
  key: string;
  name: string;
  orders: number;
  from: string;
  to: string;
  total: number;
};

export function InvoiceTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings } = useSettings();

  const [customerKey, setCustomerKey] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // Prisar er av som standard: grunnlaget kan hamne hos kunden, og då skal
  // beløpa vere eit medvite val og ikkje noko som følgjer med av vane.
  const [showPrices, setShowPrices] = useState(false);
  const [showSignatures, setShowSignatures] = useState(true);
  const [showProject, setShowProject] = useState(true);
  const [showOrderNumbers, setShowOrderNumbers] = useState(true);
  const pdfOptions = { showPrices, showSignatures, showProject, showOrderNumbers };

  const uninvoiced = useQuery({
    // Under QK.orders slik at ei vanleg invalidering av bestillingane treffer her òg
    queryKey: [...QK.orders, "ufakturert"],
    queryFn: () => fetchOrders({ onlyUninvoiced: true }),
  });

  const invoices = useQuery({ queryKey: QK.invoices, queryFn: fetchInvoices });

  const orders = uninvoiced.data ?? [];

  /* ---------------- Steg 1: kundane som har noko å fakturere ---------------- */

  const customers = useMemo<CustomerGroup[]>(() => {
    const seen = new Map<string, CustomerGroup>();
    orders.forEach((o) => {
      const key = nameKey(o.customer_name);
      if (!key) return;
      const day = orderDay(o);
      const prev = seen.get(key);
      const sum = (o.lines ?? []).reduce((acc, l) => acc + (l.line_total ?? 0), 0);
      if (!prev) {
        seen.set(key, { key, name: o.customer_name, orders: 1, from: day, to: day, total: sum });
        return;
      }
      prev.orders += 1;
      prev.total += sum;
      if (day < prev.from) prev.from = day;
      if (day > prev.to) prev.to = day;
    });
    return [...seen.values()].sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, "nb"));
  }, [orders]);

  const chooseCustomer = (c: CustomerGroup) => {
    setCustomerKey(c.key);
    setCustomerName(c.name);
    // Standardperioden er heile spennet kunden har ufakturert – då slepp ein
    // å oppdage i etterkant at ei gammal bestilling fall utanfor
    setFrom(c.from);
    setTo(c.to);
    setExcluded([]);
    setNote("");
  };

  const resetCustomer = () => {
    setCustomerKey(null);
    setCustomerName("");
    setExcluded([]);
  };

  /* ---------------- Steg 2: bestillingane i perioden ---------------- */

  const candidates = useMemo(() => {
    if (!customerKey) return [];
    return orders
      .filter((o) => nameKey(o.customer_name) === customerKey)
      .filter((o) => {
        const day = orderDay(o);
        return (!from || day >= from) && (!to || day <= to);
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [orders, customerKey, from, to]);

  const selected = useMemo(
    () => candidates.filter((o) => !excluded.includes(o.id)),
    [candidates, excluded],
  );

  const summary = useMemo(() => {
    const lines = selected.flatMap((o) => o.lines ?? []);
    const perUnit = new Map<string, number>();
    let total = 0;
    let utenPris = 0;
    lines.forEach((l) => {
      perUnit.set(l.unit, (perUnit.get(l.unit) ?? 0) + (l.quantity ?? 0));
      if (missingPrice(l)) utenPris += 1;
      else total += l.line_total ?? 0;
    });
    return {
      lines: lines.length,
      utenPris,
      total: Math.round(total * 100) / 100,
      // Meter og stykk kan ikkje leggjast saman – kvar eining blir summert for seg
      units: [...perUnit.entries()].map(([unit, qty]) => `${num(Math.round(qty * 10000) / 10000)} ${unit}`),
    };
  }, [selected]);

  const toggle = (id: string) =>
    setExcluded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const draftDoc = (): InvoiceDoc => ({
    invoice_number: "utkast",
    customer_name: customerName,
    period_from: from,
    period_to: to,
    total: summary.total,
    orders: toPdfOrders(selected),
    company: companyFrom(settings),
  });

  /** Opnar PDF-en i ny fane i staden for å laste ned – forhåndsvisinga skal
   *  ikkje fylle nedlastingsmappa med filer ein ikkje ville ha. */
  const preview = () => {
    if (selected.length === 0) return;
    try {
      const url = buildInvoicePDF(draftDoc(), pdfOptions).output("bloburl") as unknown as string;
      const win = window.open(url, "_blank");
      if (!win) {
        toast({
          title: "Nettleseren blokkerte fanen",
          description: "Tillat popup-vinduer for denne siden, eller last ned grunnlaget i stedet.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Klarte ikke å lage forhåndsvisningen",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      });
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const inv = await createInvoice({
        customer_name: customerName,
        period_from: from,
        period_to: to,
        order_ids: selected.map((o) => o.id),
        total: summary.total,
        note: note.trim() || undefined,
      });
      // Bestillingane blir merkte i databasen, så PDF-en må byggjast av det vi
      // alt har i handa – etter invalideringa er dei ikkje lenger ufakturerte
      const doc: InvoiceDoc = {
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        period_from: inv.period_from,
        period_to: inv.period_to,
        total: Number(inv.total ?? summary.total),
        orders: toPdfOrders(selected),
        company: companyFrom(settings),
      };
      downloadInvoicePDF(doc, pdfOptions);
      return inv;
    },
    onSuccess: (inv) => {
      toast({
        title: `Fakturagrunnlag nr. ${inv.invoice_number}`,
        description: `${selected.length} ${selected.length === 1 ? "bestilling" : "bestillinger"} er samlet. PDF-en lastes ned nå.`,
      });
      qc.invalidateQueries({ queryKey: QK.orders });
      qc.invalidateQueries({ queryKey: QK.invoices });
      resetCustomer();
    },
    onError: (e: unknown) =>
      toast({
        title: "Grunnlaget ble ikke laget",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      }),
  });

  /* ---------------- Tidlegare grunnlag ---------------- */

  const [busyInvoice, setBusyInvoice] = useState<string | null>(null);

  const rebuild = async (inv: PipeInvoiceRow) => {
    setBusyInvoice(inv.id);
    try {
      // Fakturerte bestillingar ligg ikkje i lista over ufakturerte, så dei må
      // hentast på nytt og plukkast ut på invoice_id
      const all = await fetchOrders();
      const rows = all.filter((o) => o.invoice_id === inv.id);
      if (rows.length === 0) {
        toast({
          title: "Fant ingen bestillinger",
          description: "Grunnlaget peker ikke lenger på noen bestillinger.",
          variant: "destructive",
        });
        return;
      }
      downloadInvoicePDF(
        {
          invoice_number: inv.invoice_number,
          customer_name: inv.customer_name,
          period_from: inv.period_from,
          period_to: inv.period_to,
          total: Number(inv.total ?? 0),
          orders: toPdfOrders(rows),
          company: companyFrom(settings),
        },
        pdfOptions,
      );
    } catch (e) {
      toast({
        title: "Klarte ikke å lage PDF-en",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      });
    } finally {
      setBusyInvoice(null);
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      toast({
        title: "Grunnlaget er angret",
        description: "Bestillingene er ufakturerte igjen og kan tas med på et nytt grunnlag.",
      });
      qc.invalidateQueries({ queryKey: QK.orders });
      qc.invalidateQueries({ queryKey: QK.invoices });
    },
    onError: (e: unknown) =>
      toast({
        title: "Klarte ikke å angre grunnlaget",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      }),
  });

  /* ---------------- Visning ---------------- */

  const pdfToggles: { id: string; label: string; hint: string; value: boolean; set: (v: boolean) => void }[] = [
    {
      id: "pdf-priser",
      label: "Vis priser og sum",
      hint: "Av som standard. Huk av når grunnlaget skal vise beløp.",
      value: showPrices,
      set: setShowPrices,
    },
    {
      id: "pdf-signaturer",
      label: "Vis signaturer",
      hint: "Kvitteringen på at rørene faktisk ble hentet. Gjør filen større.",
      value: showSignatures,
      set: setShowSignatures,
    },
    {
      id: "pdf-prosjekt",
      label: "Vis prosjekt",
      hint: "Prosjektet kunden oppga, over hver bestilling.",
      value: showProject,
      set: setShowProject,
    },
    {
      id: "pdf-ordrenr",
      label: "Vis ordrenummer",
      hint: "Gjør det lett å slå opp en enkelt bestilling i etterkant.",
      value: showOrderNumbers,
      set: setShowOrderNumbers,
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nytt fakturagrunnlag</CardTitle>
          <p className="text-sm text-muted-foreground">
            Samler alle ufakturerte bestillinger for én kunde i en periode, og laster ned PDF-en med en gang.
            Statusen på bestillingene blir ikke rørt.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {uninvoiced.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : uninvoiced.isError ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-3">
              <p className="text-sm text-destructive">
                {uninvoiced.error instanceof Error
                  ? uninvoiced.error.message
                  : "Klarte ikke å hente bestillingene."}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => uninvoiced.refetch()}>
                Prøv igjen
              </Button>
            </div>
          ) : !customerKey ? (
            /* ---- Steg 1 ---- */
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Steg 1 · Velg kunde
              </p>
              {customers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Alle bestillinger er fakturert. Nye uttak dukker opp her med en gang de kommer inn.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {customers.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => chooseCustomer(c)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground tabular">
                          {c.orders} {c.orders === 1 ? "bestilling" : "bestillinger"} ·{" "}
                          {shortDate(c.from)}–{shortDate(c.to)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground tabular">
                        {krShort(c.total)} kr
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ---- Steg 2 ---- */
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-2"
                  onClick={resetCustomer}
                  aria-label="Velg en annen kunde"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                  Bytt kunde
                </Button>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{customerName}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="min-w-[9rem] flex-1 space-y-1.5">
                  <Label htmlFor="faktura-fra">Fra dato</Label>
                  <Input
                    id="faktura-fra"
                    type="date"
                    className="h-11 dark:[color-scheme:dark]"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="min-w-[9rem] flex-1 space-y-1.5">
                  <Label htmlFor="faktura-til">Til dato</Label>
                  <Input
                    id="faktura-til"
                    type="date"
                    className="h-11 dark:[color-scheme:dark]"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </div>

              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ingen ufakturerte bestillinger for {customerName} i denne perioden.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Steg 2 · Hva skal med
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExcluded(excluded.length === 0 ? candidates.map((o) => o.id) : [])
                      }
                    >
                      {excluded.length === 0 ? "Fjern alle" : "Velg alle"}
                    </Button>
                  </div>

                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {candidates.map((o) => {
                      const on = !excluded.includes(o.id);
                      const lines = o.lines ?? [];
                      const sum = lines.reduce((acc, l) => acc + (l.line_total ?? 0), 0);
                      const mangler = lines.some(missingPrice);
                      return (
                        <label
                          key={o.id}
                          className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={on}
                            onCheckedChange={() => toggle(o.id)}
                            aria-label={`Ta med bestilling nummer ${o.order_number}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground tabular">
                              #{o.order_number}
                              <span className="ml-2 font-normal text-muted-foreground">
                                {shortDate(o.created_at)}
                              </span>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {lines.length === 0
                                ? "Ingen linjer"
                                : lines
                                    .map((l) => `${pipeLabel(l.name, l.dimension)} ${num(l.quantity)} ${l.unit}`)
                                    .join(" · ")}
                            </p>
                            {o.project ? (
                              <p className="truncate text-xs text-muted-foreground">Prosjekt: {o.project}</p>
                            ) : null}
                          </div>
                          <span
                            className={`shrink-0 text-sm font-semibold tabular ${
                              mangler ? "text-warning-ink" : "text-foreground"
                            }`}
                          >
                            {krShort(sum)} kr
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {summary.utenPris > 0 && (
                    <div className="flex gap-2.5 rounded-lg border border-warning/60 bg-warning/10 px-3 py-2.5">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
                      <p className="text-sm text-warning-ink">
                        {summary.utenPris} {summary.utenPris === 1 ? "linje mangler" : "linjer mangler"} pris og
                        teller ikke med i summen. Sett prisen på rørtypen under Lager først hvis den skal med.
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {selected.length} av {candidates.length}{" "}
                          {candidates.length === 1 ? "bestilling" : "bestillinger"} · {summary.lines}{" "}
                          {summary.lines === 1 ? "linje" : "linjer"}
                          {summary.units.length > 0 && ` · ${summary.units.join("  ")}`}
                        </p>
                        <p className="text-2xl font-bold text-primary tabular">{kr(summary.total)} kr</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Hva skal stå på PDF-en
                    </p>
                    {pdfToggles.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-start gap-2.5">
                        <Checkbox
                          id={t.id}
                          className="mt-0.5"
                          checked={t.value}
                          onCheckedChange={(v) => t.set(v === true)}
                        />
                        <span className="text-sm">
                          <span className="text-foreground">{t.label}</span>
                          <span className="block text-xs text-muted-foreground">{t.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="faktura-notat">Notat på grunnlaget (valgfritt)</Label>
                    <Input
                      id="faktura-notat"
                      className="h-11"
                      placeholder="For eksempel referanse eller bestillingsnummer"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={preview}
                      disabled={selected.length === 0}
                    >
                      <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                      Forhåndsvis PDF
                    </Button>
                    <Button
                      className="h-11 flex-1 sm:flex-none"
                      onClick={() => create.mutate()}
                      disabled={selected.length === 0 || create.isPending}
                    >
                      {create.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      Opprett fakturagrunnlag
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tidligere grunnlag</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : invoices.isError ? (
            <p className="text-sm text-destructive">
              {invoices.error instanceof Error ? invoices.error.message : "Klarte ikke å hente grunnlagene."}
            </p>
          ) : (invoices.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen fakturagrunnlag er laget ennå.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {(invoices.data ?? []).map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="w-12 shrink-0 text-sm font-semibold text-foreground tabular">
                    #{inv.invoice_number}
                  </span>
                  <div className="min-w-[9rem] flex-1">
                    <p className="truncate text-sm text-foreground">{inv.customer_name}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {shortDate(inv.period_from)}–{shortDate(inv.period_to)} · laget {shortDate(inv.created_at)}
                      {inv.note ? ` · ${inv.note}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-foreground tabular">
                    {krShort(inv.total)} kr
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    aria-label={`Last ned PDF for grunnlag nummer ${inv.invoice_number} på nytt`}
                    disabled={busyInvoice === inv.id}
                    onClick={() => rebuild(inv)}
                  >
                    {busyInvoice === inv.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileDown className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        aria-label={`Angre grunnlag nummer ${inv.invoice_number}`}
                      >
                        <RotateCcw className="h-4 w-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Angre grunnlag nr. {inv.invoice_number}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Bestillingene til {inv.customer_name} blir ufakturerte igjen, og dukker opp på nytt når
                          du lager et grunnlag. Statusen på bestillingene står som den er, og lageret blir ikke
                          rørt. Selve PDF-en du allerede har lastet ned blir ikke slettet.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(inv.id)}>Angre</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
