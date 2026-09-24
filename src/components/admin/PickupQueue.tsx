// Bestillingane i adminpanelet: stripa «Venter på godkjenning» øvst i
// Bestillinger, detaljane i sidepanelet, og dialogane kontoret godkjenner og
// avviser med. Godkjenning og avvisning flyttar rør, så dei går alltid gjennom
// databasefunksjonane – aldri gjennom statusveljaren.

import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QK, fetchPipeTypes, setOrderStatus } from "@/lib/orders";
import {
  approvePickupOrder,
  fetchOrderEmails,
  rejectPickupOrder,
  requestEmails,
  useWaitingPickupOrders,
  type EmailResult,
} from "@/lib/pickup-orders";
import { visOrgnr } from "@/lib/orgnr";
import { dateTime, kr, longDate, num, pipeLabel, qtyLabel, shortDate } from "@/lib/format";
import { summer } from "@/lib/mva";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import type { OrderWithLines } from "@/lib/types";

type Handling = { type: "godkjenn" | "avvis"; order: OrderWithLines } | null;

const EPOST_NAVN: Record<string, string> = {
  kvittering: "Kvittering til kunden",
  kontor: "Varsel til kontoret",
  klar: "«Klar til henting» til kunden",
  avvist: "Avvisning til kunden",
};

/** Kva e-posten gav, sagt slik kontoret treng det. */
export function epostMelding(r: EmailResult | null, type: "klar" | "avvist", alleredeSendt = false): string {
  if (r && !r.satt_opp)
    return "E-post er ikke satt opp, så kunden har ikke fått beskjed. Ring kunden, og skriv ut PDF-en til privatkunder ved henting.";
  if (r?.sendt.includes(type) || alleredeSendt) return "Kunden har fått e-post.";
  if (r && r.feilet.length === 0)
    return "E-posten er ikke sendt ennå – dagens grense for e-post kan være nådd. Prøv igjen senere, eller ring kunden.";
  return "E-posten gikk ikke. Prøv igjen fra bestillingen, eller ring kunden.";
}

/**
 * Ingenting sendt og ingenting feila: kundesida eller ei anna fane kan ha sendt
 * e-posten først, og då står ho som sendt i loggen. Berre då blir loggen lesen.
 */
async function sendtAlt(r: EmailResult | null, id: string, type: "klar" | "avvist"): Promise<boolean> {
  if (!(r?.satt_opp && !r.sendt.includes(type) && r.feilet.length === 0)) return false;
  const rows = await fetchOrderEmails(id);
  return rows.some((e) => e.type === type && e.sent_at);
}

/**
 * «Klar» eller «avvist» – det kunden ventar på etter statusen, så lenge
 * e-postfunksjonen framleis sender det: same døgn som i pipe_email_claim.
 */
function kundenVentarPa(o: OrderWithLines, naa = Date.now()): "klar" | "avvist" | null {
  const iDogn = (t: string | null | undefined) => !!t && naa - new Date(t).getTime() < 24 * 60 * 60 * 1000;
  if (o.status === "behandlet" && iDogn(o.stock_drawn_at)) return "klar";
  if (o.status === "avvist" && iDogn(o.handled_at)) return "avvist";
  return null;
}

/** Beholdninga per vare, til åtvaringane. Kontoret les pipe_types. */
function useLagerKart() {
  const { data } = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t.stock])), [data]);
}

const forLite = (o: OrderWithLines, lager: Map<string, number>) =>
  o.lines.filter((l) => l.pipe_type_id && lager.has(l.pipe_type_id) && l.quantity > (lager.get(l.pipe_type_id) ?? 0));

function Rad({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PickupHandlingDialog({ handling, onClose }: { handling: Handling; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lager = useLagerKart();
  const [melding, setMelding] = useState("");
  const [busy, setBusy] = useState(false);

  const o = handling?.order ?? null;
  const godkjenn = handling?.type === "godkjenn";
  const korte = o ? forLite(o, lager) : [];

  const utfor = async () => {
    if (!o) return;
    if (!godkjenn && !melding.trim()) {
      toast({ title: "Skriv en begrunnelse til kunden", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (godkjenn) await approvePickupOrder(o.id, melding.trim() || null);
      else await rejectPickupOrder(o.id, melding.trim());
      qc.invalidateQueries({ queryKey: QK.orders });
      qc.invalidateQueries({ queryKey: QK.types });
      const type = godkjenn ? "klar" : "avvist";
      const r = await requestEmails(o.id);
      const alleredeSendt = await sendtAlt(r, o.id, type);
      qc.invalidateQueries({ queryKey: QK.orderEmails(o.id) });
      toast({
        title: godkjenn ? `Bestilling #${o.order_number} er godkjent` : `Bestilling #${o.order_number} er avvist`,
        description: epostMelding(r, type, alleredeSendt),
      });
      onClose();
    } catch (err) {
      toast({
        variant: "destructive",
        title: godkjenn ? "Klarte ikke å godkjenne" : "Klarte ikke å avvise",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={o !== null} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        {o ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {godkjenn ? `Godkjenne bestilling #${o.order_number}?` : `Avvise bestilling #${o.order_number}?`}
              </DialogTitle>
              <DialogDescription>
                {godkjenn
                  ? "Lageret trekkes nå, og kunden får e-post om at varene er klare til henting."
                  : o.stock_drawn_at
                    ? "Rørene legges tilbake på lageret, og kunden får begrunnelsen på e-post."
                    : "Lageret er ikke trukket for denne. Kunden får begrunnelsen på e-post."}
              </DialogDescription>
            </DialogHeader>

            {godkjenn && korte.length > 0 ? (
              <div className="rounded-lg border border-warning/30 bg-warning/15 px-3 py-2.5 text-sm text-warning-ink">
                <p className="font-medium">Lageret viser for lite av:</p>
                <ul className="mt-1 list-disc pl-5">
                  {korte.map((l) => (
                    <li key={l.id}>
                      {pipeLabel(l.name, l.dimension)}: {qtyLabel(l.quantity, l.unit)} bestilt,{" "}
                      {num(lager.get(l.pipe_type_id as string) ?? 0)} på lager
                    </li>
                  ))}
                </ul>
                <p className="mt-1">Godkjenner du likevel, går beholdningen i minus.</p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="handling-melding">{godkjenn ? "Melding til kunden (valgfri)" : "Begrunnelse til kunden"}</Label>
              <Textarea
                id="handling-melding"
                rows={3}
                maxLength={1000}
                value={melding}
                onChange={(e) => setMelding(e.target.value)}
                placeholder={godkjenn ? "F.eks. ligger klart ved port 2" : "F.eks. vi har ikke dette på lager før om to uker"}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Avbryt
              </Button>
              <Button
                variant={godkjenn ? "default" : "destructive"}
                onClick={utfor}
                disabled={busy || (!godkjenn && !melding.trim())}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {godkjenn ? "Godkjenn" : "Avvis bestillingen"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Stripa øvst i Bestillinger. Viser seg berre når noko ventar. */
export function PickupQueue({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: venter = [] } = useWaitingPickupOrders(true);
  const lager = useLagerKart();
  const { data: settings } = useSettings();
  const mva = settings?.vat_rate ?? 25;
  const [handling, setHandling] = useState<Handling>(null);

  if (venter.length === 0) return null;

  return (
    <section className="hm-card border-primary/40 p-3 sm:p-4" aria-labelledby="venter-tittel">
      <h2 id="venter-tittel" className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
        Venter på godkjenning ({venter.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {venter.map((o) => (
          <li key={o.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" onClick={() => onOpen(o.id)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tabular font-semibold text-foreground">#{o.order_number}</span>
                  {o.pickup_now ? (
                    <span className="hm-chip border border-destructive/30 bg-destructive/15 text-destructive">HENTER NÅ</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Hentes {longDate(o.pickup_date)}</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm text-foreground">
                  {o.company ?? o.customer_name}
                  {o.company ? <span className="text-muted-foreground"> · {o.customer_name}</span> : null}
                </span>
                <span className="tabular block text-xs text-muted-foreground">
                  {o.lines.length} {o.lines.length === 1 ? "linje" : "linjer"} · {kr(summer([o.total], mva).eks)} kr eks. ·{" "}
                  {kr(summer([o.total], mva).inkl)} kr inkl. mva · sendt {shortDate(o.created_at)}
                </span>
                {forLite(o, lager).length > 0 ? (
                  <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning-ink">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    Lageret viser for lite av noe
                  </span>
                ) : null}
              </button>
              <div className="flex gap-2">
                <Button size="sm" className="h-10" onClick={() => setHandling({ type: "godkjenn", order: o })}>
                  <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                  Godkjenn
                </Button>
                <Button size="sm" variant="outline" className="h-10" onClick={() => setHandling({ type: "avvis", order: o })}>
                  <X className="mr-1 h-4 w-4" aria-hidden="true" />
                  Avvis
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {/* key: ny bestilling eller ny handling gir tom melding */}
      <PickupHandlingDialog
        key={handling ? `${handling.type}-${handling.order.id}` : "ingen"}
        handling={handling}
        onClose={() => setHandling(null)}
      />
    </section>
  );
}

/** Det som er særeige for ei bestilling, i sidepanelet i Bestillinger. */
export function PickupDetails({ order }: { order: OrderWithLines }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const lager = useLagerKart();
  const logg = useQuery({ queryKey: QK.orderEmails(order.id), queryFn: () => fetchOrderEmails(order.id) });
  const [handling, setHandling] = useState<Handling>(null);
  const [busy, setBusy] = useState(false);

  const settStatus = async (neste: "levert" | "behandlet") => {
    setBusy(true);
    try {
      await setOrderStatus(order.id, neste);
      qc.invalidateQueries({ queryKey: QK.orders });
      toast({ title: neste === "levert" ? "Markert som hentet" : "Satt tilbake til klar til henting" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Klarte ikke å endre status",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const sendIgjen = async () => {
    setBusy(true);
    const r = await requestEmails(order.id);
    // Ingenting sendt og ingenting feila er ikkje det same som «alt er sendt»:
    // er grensa for dagen nådd, står «klar» eller «avvist» framleis usendt.
    const type = kundenVentarPa(order);
    const alleredeSendt = type ? await sendtAlt(r, order.id, type) : false;
    qc.invalidateQueries({ queryKey: QK.orderEmails(order.id) });
    setBusy(false);
    if (!r) toast({ variant: "destructive", title: "E-posten gikk ikke", description: "Prøv igjen om litt." });
    else if (!r.satt_opp) toast({ title: "E-post er ikke satt opp", description: "Se docs/bestilling-epost.md." });
    else if (r.sendt.length) toast({ title: "Sendt", description: r.sendt.map((t) => EPOST_NAVN[t] ?? t).join(", ") });
    else if (r.feilet.length) toast({ variant: "destructive", title: "E-posten gikk ikke", description: "Prøv igjen om litt." });
    else if (type)
      toast({ title: alleredeSendt ? "Ingenting å sende" : "Ikke sendt", description: epostMelding(r, type, alleredeSendt) });
    else toast({ title: "Ingenting å sende", description: "Alt er allerede sendt, eller hendelsen er eldre enn et døgn." });
  };

  const bedrift = order.customer_type === "bedrift";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border px-3 py-1">
        <Rad label="Bestiller" value={bedrift ? "Bedrift" : "Privatperson"} />
        {bedrift ? (
          <Rad label="Org.nr." value={order.org_number ? visOrgnr(order.org_number) : null} />
        ) : (
          <Rad label="Fakturaadresse" value={order.billing_address} />
        )}
        <Rad
          label="Hentes"
          value={order.pickup_now ? `Henter nå (${longDate(order.pickup_date)})` : longDate(order.pickup_date)}
        />
        <Rad label="Melding til kunden" value={order.customer_message} />
      </div>

      {order.status === "ny" ? (
        <ul className="space-y-1 text-sm">
          {order.lines.map((l) => {
            const s = l.pipe_type_id ? lager.get(l.pipe_type_id) : undefined;
            const kort = s !== undefined && l.quantity > s;
            return (
              <li key={l.id} className={cn("flex justify-between gap-3", kort && "font-medium text-warning-ink")}>
                <span className="min-w-0 truncate">{pipeLabel(l.name, l.dimension)}</span>
                <span className="tabular shrink-0">
                  {qtyLabel(l.quantity, l.unit)} · {s === undefined ? "ukjent lager" : `${num(s)} ${l.unit} på lager`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {order.status === "ny" ? (
          <>
            <Button className="h-11" onClick={() => setHandling({ type: "godkjenn", order })} disabled={busy}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Godkjenn
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setHandling({ type: "avvis", order })} disabled={busy}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Avvis
            </Button>
          </>
        ) : null}
        {order.status === "behandlet" ? (
          <>
            <Button className="h-11" onClick={() => settStatus("levert")} disabled={busy}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Hentet
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setHandling({ type: "avvis", order })} disabled={busy}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Avvis
            </Button>
          </>
        ) : null}
        {order.status === "levert" ? (
          <Button variant="outline" className="h-11" onClick={() => settStatus("behandlet")} disabled={busy}>
            Angre hentet
          </Button>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-foreground">E-post</p>
        {logg.data && logg.data.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {logg.data.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{EPOST_NAVN[e.type] ?? e.type}</span>
                <span className="tabular">{e.sent_at ? dateTime(e.sent_at) : "ikke sendt"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen e-post er sendt ennå.</p>
        )}
        <Button variant="ghost" size="sm" className="mt-1" onClick={sendIgjen} disabled={busy}>
          <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
          Send det som mangler
        </Button>
      </div>

      <PickupHandlingDialog
        key={handling ? `${handling.type}-${handling.order.id}` : "ingen"}
        handling={handling}
        onClose={() => setHandling(null)}
      />
    </div>
  );
}
