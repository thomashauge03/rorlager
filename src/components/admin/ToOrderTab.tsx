// «Å bestille»: kontorets oversyn over kva byggjeplassane har meldt inn.
//
// Tre utsnitt av same lista, fordi kontoret har tre ulike spørsmål gjennom
// dagen: kva skal eg tinge no, kva står ute hos leverandøren, og kva gjekk
// gale i det som kom.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCopy, FileDown, Inbox, Loader2, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DeviationBadge, ProjectStatusBadge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
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
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import { fetchAllProjectOrders, fetchProjects, isOverdue, markOrdered, saveOfficeNote, setOrderStatus } from "@/lib/projects";
import { useSettings } from "@/lib/settings";
import { downloadReceiptPDFMedBilder } from "@/lib/receipt-pdf";
import { dateTime, num, parseNum, pipeLabel, shortDate } from "@/lib/format";
import type { ProjectOrderWithLines } from "@/lib/types";

type Utsnitt = "bestille" | "underveis" | "mottak" | "avvik";

const UTSNITT: { verdi: Utsnitt; navn: string }[] = [
  { verdi: "bestille", navn: "Å bestille" },
  { verdi: "underveis", navn: "Underveis" },
  { verdi: "mottak", navn: "Mottak" },
  { verdi: "avvik", navn: "Avvik" },
];

export function ToOrderTab() {
  const [utsnitt, setUtsnitt] = useState<Utsnitt>("bestille");
  const [åpen, setÅpen] = useState<ProjectOrderWithLines | null>(null);

  const orders = useQuery({ queryKey: QK.projectOrders, queryFn: fetchAllProjectOrders });
  const projects = useQuery({ queryKey: QK.projects, queryFn: fetchProjects });
  const { data: settings } = useSettings();

  // Eitt kart, brukt av begge utsnitta. Låg tidlegare som eit memoisert kart
  // for namnet og eit lineært `find` for rada – to måtar å gjere same oppslaget.
  const prosjektKart = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p])),
    [projects.data],
  );
  const prosjektNavn = (id: string) => prosjektKart.get(id)?.name ?? "Ukjent prosjekt";

  const alle = orders.data ?? [];

  const bestille = alle.filter((o) => o.status === "meldt");
  const underveis = alle.filter((o) => o.status === "bestilt" || o.status === "delvis");
  /*
   * Alle mottak, nyaste først.
   *
   * Kontoret såg tidlegare berre AVVIK, aldri dei normale mottaka – altså
   * ingen måte å svare på «kom dette, og kven tok imot?» utan å opne kvar
   * bestilling for seg.
   */
  const mottak = alle
    .flatMap((o) => o.receipts.map((r) => ({ order: o, receipt: r })))
    .sort((a, b) => b.receipt.received_at.localeCompare(a.receipt.received_at));

  const medAvvik = alle
    .flatMap((o) =>
      o.receipts.flatMap((r) =>
        r.lines
          .filter((rl) => rl.deviation !== "ingen")
          .map((rl) => ({
            order: o,
            receipt: r,
            line: rl,
            navn: o.lines.find((l) => l.id === rl.order_line_id)?.name ?? "Ukjent vare",
          })),
      ),
    )
    .sort((a, b) => b.receipt.received_at.localeCompare(a.receipt.received_at));

  const prosjektRad = (id: string) => prosjektKart.get(id) ?? null;

  const pdfFirma = {
    name: settings?.company_name || "Hauge Maskin AS",
    orgNumber: settings?.org_number ?? null,
    address: settings?.address ?? null,
    phone: settings?.phone ?? null,
    email: settings?.email ?? null,
  };

  const vist = utsnitt === "bestille" ? bestille : utsnitt === "underveis" ? underveis : [];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="hm-card flex flex-wrap gap-2 p-3">
        {UTSNITT.map((u) => {
          const antal =
            u.verdi === "bestille"
              ? bestille.length
              : u.verdi === "underveis"
                ? underveis.length
                : u.verdi === "mottak"
                  ? mottak.length
                  : medAvvik.length;
          return (
            <button
              key={u.verdi}
              type="button"
              aria-pressed={utsnitt === u.verdi}
              onClick={() => setUtsnitt(u.verdi)}
              className={`hm-chip h-11 px-3 transition-colors ${
                utsnitt === u.verdi
                  ? "border border-primary bg-primary text-primary-foreground"
                  : "border border-border bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {u.navn}
              <span className="tabular ml-1.5 font-semibold">{antal}</span>
            </button>
          );
        })}
      </div>

      {orders.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : orders.isError || projects.isError ? (
        <div className="hm-card p-6">
          <p className="text-sm font-semibold text-destructive">
            {orders.isError ? "Bestillingene" : "Prosjektene"} kunne ikke hentes
          </p>
          <p className="mt-1 text-sm text-foreground">
            {(orders.error ?? projects.error) instanceof Error
              ? (orders.error ?? projects.error)!.message
              : "Ukjent feil"}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              if (orders.isError) orders.refetch();
              if (projects.isError) projects.refetch();
            }}
          >
            Prøv igjen
          </Button>
        </div>
      ) : utsnitt === "mottak" ? (
        mottak.length === 0 ? (
          <TomTilstand
            ikon={<PackageCheck className="h-7 w-7 text-primary" aria-hidden="true" />}
            tittel="Ingen mottak ennå"
            tekst="Når plassen kvitterer for en leveranse, dukker den opp her."
          />
        ) : (
          <ul className="space-y-2">
            {mottak.map(({ order, receipt }) => {
              const avvikPaa = receipt.lines.filter((l) => l.deviation !== "ingen").length;
              const p = prosjektRad(order.project_id);
              return (
                <li key={receipt.id} className="hm-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{p?.name ?? "Ukjent prosjekt"}</p>
                      <p className="tabular text-sm text-muted-foreground">
                        Mottak #{receipt.receipt_number} · bestilling #{order.order_number}
                      </p>
                    </div>
                    {/* Manglande bilete er verdt like mykje merksemd som eit
                        avvik: det er dokumentasjonen som skal følgje ein
                        reklamasjon. */}
                    {receipt.no_photo_reason ? (
                      <span className="hm-chip shrink-0 border border-warning/30 bg-warning/15 text-warning-ink dark:text-warning">
                        Uten bilde
                      </span>
                    ) : null}
                    {avvikPaa > 0 ? (
                      <span className="hm-chip shrink-0 border border-destructive/30 bg-destructive/15 text-destructive">
                        {avvikPaa} avvik
                      </span>
                    ) : (
                      <span className="hm-chip shrink-0 border border-success/30 bg-success/15 text-success">
                        Uten avvik
                      </span>
                    )}
                  </div>

                  {/* Namnet står som tekst, ikkje i ei hm-stat-rute: den er
                      laga for tal (text-lg font-bold, fast breidd), og eit langt
                      namn flyt over henne. */}
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tatt imot av <span className="font-medium text-foreground">{receipt.received_by_name}</span> ·{" "}
                    <span className="tabular">{dateTime(receipt.received_at)}</span>
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Stat label="Varelinjer" value={String(receipt.lines.length)} />
                    <Stat label="Bilder" value={String(receipt.photos.length)} />
                    <Stat label="Bestilling" value={`#${order.order_number}`} />
                  </div>

                  {receipt.no_photo_reason ? (
                    <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink dark:text-warning">
                      Ingen bilde: «{receipt.no_photo_reason}»
                    </p>
                  ) : null}

                  <ul className="mt-3 space-y-1 border-t border-border pt-3">
                    {receipt.lines.map((rl) => {
                      const linje = order.lines.find((l) => l.id === rl.order_line_id);
                      return (
                        <li key={rl.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {linje ? pipeLabel(linje.name, linje.dimension) : "Ukjent vare"}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="tabular text-foreground">
                              {num(Number(rl.received_qty))} {linje?.unit ?? ""}
                            </span>
                            {rl.deviation !== "ingen" ? <DeviationBadge deviation={rl.deviation} /> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {receipt.note ? <p className="mt-2 text-sm text-foreground">«{receipt.note}»</p> : null}

                  {/* Utskrifta er det som blir sendt leverandøren ved reklamasjon */}
                  {/* Stengd til prosjektlista er lesen. Uten den blir
                      prosjektnavnet «Prosjekt» og adressen tom i PDF-en — og
                      den PDF-en er reklamasjonsgrunnlaget mot leverandøren. */}
                  <Button
                    variant="outline"
                    className="mt-3 h-11 w-full"
                    disabled={!p}
                    onClick={() =>
                      p
                        ? downloadReceiptPDFMedBilder({
                            company: pdfFirma,
                            projectName: p.name,
                            projectAddress: p.address,
                            order,
                            receipt,
                            photoPaths: receipt.photos.map((f) => f.path),
                          })
                        : undefined
                    }
                  >
                    <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                    {p ? "Last ned mottakskontrollen" : "Henter prosjektet …"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : utsnitt === "avvik" ? (
        medAvvik.length === 0 ? (
          <TomTilstand
            ikon={<PackageCheck className="h-7 w-7 text-primary" aria-hidden="true" />}
            tittel="Ingen avvik"
            tekst="Alt som er kvittert for, kom slik det skulle."
          />
        ) : (
          <ul className="space-y-2">
            {medAvvik.map((a) => (
              <li key={a.line.id} className="hm-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{a.navn}</p>
                    <p className="text-sm text-muted-foreground">
                      {prosjektNavn(a.order.project_id)} · bestilling #{a.order.order_number}
                    </p>
                  </div>
                  <DeviationBadge deviation={a.line.deviation} />
                </div>
                <p className="tabular mt-2 text-sm text-muted-foreground">
                  {num(a.line.received_qty)} mottatt · kvittert av {a.receipt.received_by_name}{" "}
                  {shortDate(a.receipt.received_at)}
                </p>
                {a.line.note ? <p className="mt-1 text-sm text-foreground">«{a.line.note}»</p> : null}
                {a.order.supplier ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {a.order.supplier}
                    {a.order.supplier_ref ? ` · ${a.order.supplier_ref}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : vist.length === 0 ? (
        <TomTilstand
          ikon={<Inbox className="h-7 w-7 text-primary" aria-hidden="true" />}
          tittel={utsnitt === "bestille" ? "Ingenting å bestille" : "Ingenting underveis"}
          tekst={
            utsnitt === "bestille"
              ? "Byggeplassene har ikke meldt inn noe nytt."
              : "Alt som er bestilt, er kvittert for."
          }
        />
      ) : (
        <ul className="space-y-2">
          {vist.map((o) => {
            const forsinka = isOverdue(o);
            return (
              <li key={o.id} className="hm-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{prosjektNavn(o.project_id)}</p>
                    <p className="tabular text-sm text-muted-foreground">
                      #{o.order_number} · {o.requested_by_name ?? "ukjent"} · {shortDate(o.created_at)}
                    </p>
                  </div>
                  <ProjectStatusBadge status={o.status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Stat label="Varelinjer" value={String(o.lines.length)} />
                  {o.needed_by ? <Stat label="Trengs innen" value={shortDate(o.needed_by)} /> : null}
                  {o.expected_at ? <Stat label="Ventet" value={shortDate(o.expected_at)} /> : null}
                </div>

                {forsinka ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-warning-ink dark:text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Skulle vært levert {shortDate(o.expected_at)}
                  </p>
                ) : null}

                {o.note ? <p className="mt-2 text-sm text-foreground">«{o.note}»</p> : null}

                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {o.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {pipeLabel(l.name, l.dimension)}
                        {l.pipe_type_id === null ? " (fritekst)" : ""}
                      </span>
                      <span className="tabular shrink-0 text-foreground">
                        {num(l.requested_qty)} {l.unit}
                        {l.ordered_qty !== null && Number(l.ordered_qty) !== Number(l.requested_qty)
                          ? ` → ${num(Number(l.ordered_qty))}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button className="mt-4 h-11 w-full" variant={utsnitt === "bestille" ? "default" : "outline"} onClick={() => setÅpen(o)}>
                  <ShoppingBag className="mr-2 h-4 w-4" aria-hidden="true" />
                  {utsnitt === "bestille" ? "Registrer bestilling" : "Endre bestillingen"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {åpen ? <BestillPanel order={åpen} prosjekt={prosjektNavn(åpen.project_id)} onClose={() => setÅpen(null)} /> : null}
    </div>
  );
}

function TomTilstand({ ikon, tittel, tekst }: { ikon: React.ReactNode; tittel: string; tekst: string }) {
  return (
    <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="rounded-full bg-primary/10 p-4 ring-8 ring-primary/5">{ikon}</div>
      <p className="mt-1 font-semibold text-foreground">{tittel}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{tekst}</p>
    </div>
  );
}

/**
 * Her får «forventet» sin verdi.
 *
 * Antalet kontoret skriv inn er det mottakskontrollen på plassen blir målt mot,
 * ikkje det byggjeplassen bad om. Difor står begge tala synleg side om side.
 */
function BestillPanel({
  order,
  prosjekt,
  onClose,
}: {
  order: ProjectOrderWithLines;
  prosjekt: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [antal, setAntal] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.lines.map((l) => [
        l.id,
        String(l.ordered_qty ?? l.requested_qty).replace(".", ","),
      ]),
    ),
  );
  const [leverandør, setLeverandør] = useState(order.supplier ?? "Brødrene Dahl");
  const [ordrenr, setOrdrenr] = useState(order.supplier_ref ?? "");
  const [ventet, setVentet] = useState(order.expected_at ?? "");
  const [notat, setNotat] = useState(order.office_note ?? "");

  const lagre = useMutation({
    mutationFn: async () => {
      const linjer = order.lines.map((l) => {
        const v = parseNum(antal[l.id] ?? "");
        if (v === null || v < 0) throw new Error(`Fyll inn et antall for «${l.name}». Skriv 0 for å stryke linja.`);
        return { id: l.id, ordered_qty: v };
      });
      if (linjer.every((l) => l.ordered_qty === 0)) throw new Error("Minst én linje må bestilles.");

      return markOrdered({
        orderId: order.id,
        supplier: leverandør.trim() || null,
        supplierRef: ordrenr.trim() || null,
        expectedAt: ventet || null,
        officeNote: notat.trim() || null,
        lines: linjer,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projectOrders });
      toast({ title: "Bestillingen er registrert", description: "Plassen kan nå kvittere for mottak." });
      onClose();
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Bestillingen ble ikke registrert", description: error.message }),
  });

  const [skalAvvise, setSkalAvvise] = useState(false);
  const [grunn, setGrunn] = useState("");

  /**
   * Tabulatordelt, klart for å limast inn i eit rekneark eller hos
   * leverandøren. Tek antalet slik det står i felta no, ikkje slik det låg i
   * basen – det er det som faktisk skal tingast.
   */
  const kopierListe = async () => {
    const rader = order.lines
      .map((l) => {
        const v = parseNum(antal[l.id] ?? "");
        return { l, v: v ?? 0 };
      })
      .filter((r) => r.v > 0)
      .map(({ l, v }) => [l.sku ?? "", pipeLabel(l.name, l.dimension), num(v), l.unit].join("\t"));

    if (rader.length === 0) {
      toast({ variant: "destructive", title: "Ingenting å kopiere", description: "Ingen linjer har et antall." });
      return;
    }

    const tekst = [`Varenr\tVare\tAntall\tEnhet`, ...rader].join("\n");
    try {
      await navigator.clipboard.writeText(tekst);
      toast({ title: "Lista er kopiert", description: `${rader.length} linjer klare til å limes inn.` });
    } catch {
      toast({
        variant: "destructive",
        title: "Klarte ikke å kopiere",
        description: "Nettleseren tillot det ikke. Marker og kopier for hånd.",
      });
    }
  };

  const avvis = useMutation({
    mutationFn: async () => {
      if (!grunn.trim()) throw new Error("Skriv hvorfor. Plassen ser bare et grått «Avvist» uten en begrunnelse.");
      // Grunnen inn i office_note FØR statusen: etter avvisning er raden
      // uansett kontorets, men rekkefølgen gjør at en feilet skriving ikke
      // etterlater et avvist behov uten forklaring.
      await saveOfficeNote(order.id, grunn.trim());
      return setOrderStatus(order.id, "avvist");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.projectOrders });
      toast({ title: "Behovet er avvist", description: "Begrunnelsen vises på prosjektsiden." });
      setSkalAvvise(false);
      onClose();
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Kunne ikke avvise", description: error.message }),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {prosjekt} · #{order.order_number}
          </SheetTitle>
        </SheetHeader>

        <p className="mt-2 text-sm text-muted-foreground">
          Antallet du skriver inn her er det plassen kvitterer mot. Skriv 0 for å stryke en linje.
        </p>

        {/* Panelet registrerer bare AT det er bestilt. Uten dette måtte
            varenumrene tastes av skjermen og inn hos leverandøren for hånd. */}
        <Button variant="outline" className="mt-3 h-11 w-full" onClick={kopierListe}>
          <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
          Kopier lista til utklippstavla
        </Button>

        <ul className="mt-4 space-y-3">
          {order.lines.map((l) => (
            <li key={l.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">{pipeLabel(l.name, l.dimension)}</p>
              {l.pipe_type_id === null ? (
                <p className="text-xs text-warning-ink dark:text-warning">Skrevet for hånd – tyd den mot katalogen</p>
              ) : l.sku ? (
                <p className="tabular text-xs text-muted-foreground">Varenr. {l.sku}</p>
              ) : null}
              {l.line_note ? <p className="mt-1 text-xs text-muted-foreground">«{l.line_note}»</p> : null}

              <div className="mt-2 flex items-center gap-3">
                <span className="tabular text-sm text-muted-foreground">
                  Bedt om {num(l.requested_qty)} {l.unit}
                </span>
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <Label htmlFor={`bestilt-${l.id}`} className="sr-only">
                  Bestilt antall {l.name}
                </Label>
                <Input
                  id={`bestilt-${l.id}`}
                  value={antal[l.id] ?? ""}
                  onChange={(e) => setAntal((f) => ({ ...f, [l.id]: e.target.value }))}
                  inputMode="decimal"
                  className="tabular h-11 w-24 text-center"
                />
                <span className="text-sm text-muted-foreground">{l.unit}</span>
              </div>

              {l.received_qty > 0 ? (
                <p className="tabular mt-1 text-xs text-muted-foreground">
                  {num(l.received_qty)} {l.unit} alt mottatt
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lev-navn">Leverandør</Label>
            <Input id="lev-navn" value={leverandør} onChange={(e) => setLeverandør(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lev-ordre">Ordrenummer hos leverandøren</Label>
            <Input
              id="lev-ordre"
              value={ordrenr}
              onChange={(e) => setOrdrenr(e.target.value)}
              placeholder="F.eks. BD-99117"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lev-dato">Forventet levering</Label>
            <Input id="lev-dato" type="date" value={ventet} onChange={(e) => setVentet(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lev-notat">Notat</Label>
            <Textarea id="lev-notat" value={notat} onChange={(e) => setNotat(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button className="h-12" disabled={lagre.isPending} onClick={() => lagre.mutate()}>
            {lagre.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Registrerer …
              </>
            ) : (
              <>
                <Truck className="mr-2 h-4 w-4" aria-hidden="true" />
                Marker som bestilt
              </>
            )}
          </Button>
          {order.status === "meldt" ? (
            <Button variant="ghost" className="h-11 text-muted-foreground" onClick={() => setSkalAvvise(true)}>
              Avvis behovet
            </Button>
          ) : null}
        </div>

        {/* Avvisning er eit endeleg trykk som ikkje kan angrast i appen, og det
            låg rett under hovudknappen der tommelen landar. Difor bekreftelse,
            og ei påkravd grunngjeving – elles ser plassen berre eit grått
            «Avvist» utan å vite kvifor. */}
        <AlertDialog open={skalAvvise} onOpenChange={(o) => !o && setSkalAvvise(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Avvise behovet fra {prosjekt}?</AlertDialogTitle>
              <AlertDialogDescription>
                Bestillingen forsvinner fra lista, og plassen ser at den er avvist. Skriv hvorfor, så vet de hva de skal
                gjøre videre.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="avvis-grunn">
                Begrunnelse <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="avvis-grunn"
                value={grunn}
                onChange={(e) => setGrunn(e.target.value)}
                rows={3}
                placeholder="F.eks. dette ligger allerede på lageret – hent det der"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={avvis.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  avvis.mutate();
                }}
              >
                {avvis.isPending ? "Avviser …" : "Avvis behovet"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
