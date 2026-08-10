// Hovudarbeidsflata i adminpanelet: alle uttak i ein periode, med detaljvising,
// statusbyte, PDF og plukkliste.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { Download, FileText, Inbox, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { dateTime, isoDate, kr, krShort, num, pipeLabel, qtyLabel, shortDate } from "@/lib/format";
import { deleteOrder, fetchOrders, QK, setOrderStatus, updateOrder } from "@/lib/orders";
import { downloadOrderPDF, downloadPickListPDF, type CompanyInfo } from "@/lib/order-pdf";
import { useSettings } from "@/lib/settings";
import { ORDER_STATUS_LABEL, type OrderStatus, type OrderWithLines } from "@/lib/types";

const STATUS_OPTIONS: (OrderStatus | "alle")[] = ["alle", "ny", "behandlet", "levert", "avvist"];

/** Meter og stykk kan ikkje leggjast saman – kvar eining blir summert for seg. */
function unitSummary(lines: { unit: string; quantity: number }[]): string {
  const per = new Map<string, number>();
  lines.forEach((l) => per.set(l.unit, (per.get(l.unit) ?? 0) + (l.quantity || 0)));
  const parts = [...per.entries()].map(([unit, qty]) => qtyLabel(Math.round(qty * 10000) / 10000, unit));
  return parts.length ? parts.join(" · ") : "–";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hm-stat">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground tabular leading-tight mt-0.5">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right break-words">{value}</span>
    </div>
  );
}

export function OrdersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { data: settings } = useSettings();

  const [from, setFrom] = useState(() => isoDate(subDays(new Date(), 29)));
  const [to, setTo] = useState(() => isoDate());
  const [status, setStatus] = useState<OrderStatus | "alle">("alle");
  const [search, setSearch] = useState("");
  const [onlyUninvoiced, setOnlyUninvoiced] = useState(false);

  // Søket ventar litt: kvart tastetrykk skulle elles gitt ei ny spørjing
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filter = { from, to, status, search: searchTerm, onlyUninvoiced };

  const { data: orders = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: [...QK.orders, filter],
    queryFn: () => fetchOrders(filter),
  });

  // show_prices styrer kundeflatene. Admin må sjå beløpa uansett for å kunne
  // fakturere, så innstillinga blir ikkje lesen her.
  const company: CompanyInfo = {
    name: settings?.company_name || "Hauge Maskin AS",
    orgNumber: settings?.org_number,
    address: settings?.address,
    phone: settings?.phone,
    email: settings?.email,
  };

  const stats = useMemo(() => {
    const allLines = orders.flatMap((o) => o.lines);
    return {
      count: orders.length,
      nye: orders.filter((o) => o.status === "ny").length,
      quantity: unitSummary(allLines),
      total: orders.reduce((sum, o) => sum + (o.total || 0), 0),
    };
  }, [orders]);

  // Detaljvisinga les frå den ferske lista, slik at eit statusbyte slår gjennom
  // i panelet utan at det må lukkast og opnast på nytt
  const open = orders.find((o) => o.id === openId) ?? null;
  useEffect(() => setNote(open?.admin_note ?? ""), [openId, open?.admin_note]);

  // Eit val som ikkje lenger er i lista skal ikkje henge att i handlingane
  const selectedOrders = orders.filter((o) => selected.includes(o.id));
  const allChecked = orders.length > 0 && selectedOrders.length === orders.length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.orders });
    // Sletting legg røra tilbake på lageret, så beholdninga må hentast på nytt
    queryClient.invalidateQueries({ queryKey: QK.types });
  };

  const fail = (err: unknown, fallback: string) =>
    toast({
      variant: "destructive",
      title: fallback,
      description: err instanceof Error ? err.message : undefined,
    });

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  const toggleAll = (checked: boolean) => setSelected(checked ? orders.map((o) => o.id) : []);

  const changeStatus = async (id: string, next: OrderStatus) => {
    setBusy(true);
    try {
      await setOrderStatus(id, next);
      refresh();
      toast({ title: `Status satt til ${ORDER_STATUS_LABEL[next]}` });
    } catch (err) {
      fail(err, "Klarte ikke å endre status");
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async (id: string) => {
    setBusy(true);
    try {
      await updateOrder(id, { admin_note: note.trim() || null });
      refresh();
      toast({ title: "Notatet er lagret" });
    } catch (err) {
      fail(err, "Klarte ikke å lagre notatet");
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = async (id: string) => {
    setBusy(true);
    try {
      await deleteOrder(id);
      setSelected((prev) => prev.filter((x) => x !== id));
      setOpenId(null);
      refresh();
      toast({ title: "Bestillingen er slettet", description: "Rørene er lagt tilbake på lageret." });
    } catch (err) {
      fail(err, "Klarte ikke å slette bestillingen");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const markSelectedHandled = async () => {
    if (!selectedOrders.length) return;
    setBusy(true);
    try {
      await Promise.all(selectedOrders.map((o) => setOrderStatus(o.id, "behandlet")));
      refresh();
      setSelected([]);
      toast({ title: `${selectedOrders.length} bestillinger merket som behandlet` });
    } catch (err) {
      fail(err, "Klarte ikke å oppdatere alle bestillingene");
    } finally {
      setBusy(false);
    }
  };

  const pickList = () => {
    if (!selectedOrders.length) return;
    try {
      downloadPickListPDF(
        selectedOrders.map((o) => ({ order: o, lines: o.lines })),
        company,
        { showPrices: true },
      );
    } catch (err) {
      fail(err, "Klarte ikke å lage plukklisten");
    }
  };

  const orderPdf = (order: OrderWithLines) => {
    try {
      downloadOrderPDF({ order, lines: order.lines, company }, { showPrices: true });
    } catch (err) {
      fail(err, "Klarte ikke å lage PDF-en");
    }
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- filter */}
      <div className="hm-card p-3 sm:p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ordre-fra">Fra dato</Label>
            <Input id="ordre-fra" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-til">Til dato</Label>
            <Input id="ordre-til" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "alle")}>
              <SelectTrigger id="ordre-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "alle" ? "Alle statuser" : ORDER_STATUS_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ordre-sok">Søk</Label>
            <div className="relative">
              <Search
                className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="ordre-sok"
                className="pl-9"
                placeholder="Navn, firma, prosjekt eller nr."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Switch id="ordre-ufakturerte" checked={onlyUninvoiced} onCheckedChange={setOnlyUninvoiced} />
          <Label htmlFor="ordre-ufakturerte" className="cursor-pointer">
            Kun ufakturerte
          </Label>
        </div>
      </div>

      {/* -------------------------------------------------------- nøkkeltal */}
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <Stat label="Bestillinger" value={num(stats.count)} />
        <Stat label="Nye" value={num(stats.nye)} />
        <Stat label="Mengde" value={stats.quantity} />
        <Stat label="Beløp" value={`${krShort(stats.total)} kr`} />
      </div>

      {/* ---------------------------------------------------- fleirvalslinje */}
      {selectedOrders.length > 0 && (
        <div className="hm-card p-3 flex flex-wrap items-center gap-2 animate-fade-in">
          <span className="text-sm font-medium text-foreground mr-1">{selectedOrders.length} valgt</span>
          <Button variant="outline" size="sm" onClick={pickList}>
            <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            Last ned plukkliste
          </Button>
          <Button size="sm" onClick={markSelectedHandled} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : null}
            Merk som behandlet
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Nullstill valg
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------------- liste */}
      {isError && (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-semibold text-destructive">Bestillingene kunne ikke hentes</p>
          <p className="text-sm text-foreground mt-1">{error instanceof Error ? error.message : "Ukjent feil"}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
            Prøv igjen
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">Henter bestillinger</span>
        </div>
      ) : orders.length === 0 && !isError ? (
        <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
          <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">
            <Inbox className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
          <p className="font-semibold text-foreground mt-1">Ingen bestillinger i perioden</p>
          <p className="text-sm text-muted-foreground max-w-xs">Prøv et annet datointervall eller en annen status.</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="hm-card hm-card-interactive p-3 flex gap-3">
              <Checkbox
                className="mt-1 shrink-0"
                checked={selected.includes(o.id)}
                onCheckedChange={(v) => toggleOne(o.id, v === true)}
                aria-label={`Velg bestilling ${o.order_number}`}
              />
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOpenId(o.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground tabular">#{o.order_number}</span>
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-sm text-foreground mt-1 truncate">
                  {o.customer_name}
                  {o.company ? <span className="text-muted-foreground"> · {o.company}</span> : null}
                </p>
                {o.project ? <p className="text-xs text-muted-foreground truncate">{o.project}</p> : null}
                <div className="flex items-center justify-between gap-2 mt-1.5 text-xs text-muted-foreground tabular">
                  <span>{dateTime(o.created_at)}</span>
                  <span>{unitSummary(o.lines)}</span>
                </div>
                <p className="text-sm font-semibold text-foreground tabular mt-1">{kr(o.total)} kr</p>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="hm-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Velg alle" />
                </TableHead>
                <TableHead className="w-16">Nr.</TableHead>
                <TableHead>Dato</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Prosjekt</TableHead>
                <TableHead className="text-right">Linjer</TableHead>
                <TableHead>Mengde</TableHead>
                <TableHead className="text-right">Beløp</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenId(o.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(o.id)}
                      onCheckedChange={(v) => toggleOne(o.id, v === true)}
                      aria-label={`Velg bestilling ${o.order_number}`}
                    />
                  </TableCell>
                  <TableCell className="font-semibold tabular">{o.order_number}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{dateTime(o.created_at)}</TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{o.customer_name}</span>
                    {o.company ? <span className="block text-xs text-muted-foreground">{o.company}</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.project || "–"}</TableCell>
                  <TableCell className="text-right tabular">{o.lines.length}</TableCell>
                  <TableCell className="tabular whitespace-nowrap">{unitSummary(o.lines)}</TableCell>
                  <TableCell className="text-right tabular whitespace-nowrap">{kr(o.total)} kr</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* -------------------------------------------------------- detaljar */}
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-3">
                  <span className="tabular">Bestilling #{open.order_number}</span>
                  <StatusBadge status={open.status} />
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-5">
                <div>
                  <DetailRow label="Kunde" value={open.customer_name} />
                  <DetailRow label="Firma" value={open.company} />
                  <DetailRow label="Prosjekt" value={open.project} />
                  <DetailRow
                    label="Telefon"
                    value={
                      open.customer_phone ? (
                        <a className="text-primary underline" href={`tel:${open.customer_phone}`}>
                          {open.customer_phone}
                        </a>
                      ) : null
                    }
                  />
                  <DetailRow
                    label="E-post"
                    value={
                      open.customer_email ? (
                        <a className="text-primary underline break-all" href={`mailto:${open.customer_email}`}>
                          {open.customer_email}
                        </a>
                      ) : null
                    }
                  />
                  <DetailRow label="Sendt inn" value={dateTime(open.created_at)} />
                  <DetailRow label="Behandlet" value={open.handled_at ? dateTime(open.handled_at) : null} />
                  <DetailRow label="Faktura" value={open.invoice_id ? "Fakturert" : "Ikke fakturert"} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">Varelinjer</p>
                  <div className="divide-y divide-border border border-border rounded-lg">
                    {open.lines.map((line) => (
                      <div key={line.id} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {pipeLabel(line.name, line.dimension)}
                          </p>
                          {line.sku ? <p className="text-xs text-muted-foreground">{line.sku}</p> : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-foreground tabular">
                            {qtyLabel(line.quantity, line.unit)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular">
                            {line.line_total === null || line.line_total === undefined
                              ? "Pris mangler"
                              : `${kr(line.line_total)} kr`}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                      <span className="text-sm font-semibold text-foreground">Sum</span>
                      <span className="text-sm font-bold text-primary tabular">{kr(open.total)} kr</span>
                    </div>
                  </div>
                </div>

                {open.comment ? (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1.5">Kommentar fra kunden</p>
                    <p className="text-sm text-foreground bg-muted/60 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {open.comment}
                    </p>
                  </div>
                ) : null}

                {open.signature ? (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1.5">Signatur</p>
                    <img
                      src={open.signature}
                      alt={`Signatur fra ${open.customer_name}`}
                      className="w-full max-w-xs rounded-lg border border-border bg-white"
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="ordre-status-detalj">Status</Label>
                  <Select value={open.status} onValueChange={(v) => changeStatus(open.id, v as OrderStatus)}>
                    <SelectTrigger id="ordre-status-detalj" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {ORDER_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ordre-notat">Internt notat</Label>
                  <Textarea
                    id="ordre-notat"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Synlig kun for administratorer"
                  />
                  <Button
                    variant="outline"
                    onClick={() => saveNote(open.id)}
                    disabled={busy || note === (open.admin_note ?? "")}
                  >
                    Lagre notat
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" className="h-11" onClick={() => orderPdf(open)}>
                    <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                    Last ned PDF
                  </Button>
                  <Button variant="destructive" className="h-11" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                    Slett
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">Registrert {shortDate(open.created_at)}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette bestillingen?</AlertDialogTitle>
            <AlertDialogDescription>
              {open
                ? `Bestilling #${open.order_number} fra ${open.customer_name} blir slettet for godt. Rørene på bestillingen blir lagt tilbake på lageret.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => open && removeOrder(open.id)}
            >
              Slett bestilling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
