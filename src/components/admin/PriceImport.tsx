// Innlesing av prislista frå Brødrene Dahl.
//
// Arket kjem med jamne mellomrom, og prisane blei før tasta inn for hand. Her
// slepp admin fila inn og ser heile forskjellen mot katalogen – ingenting går
// til databasen før han har trykt seg gjennom ei stadfesting.
//
// Sjølve lesinga og samanlikninga ligg i @/lib/price-import. Denne fila er berre
// flata: filveljar, innstillingar, tal og tabellar.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { kr, num, parseNum, pipeLabel } from "@/lib/format";
import { QK, createPipeTypes, fetchCategories, fetchPipeTypes, importCosts } from "@/lib/orders";
import { diffAgainstCatalog, parsePriceWorkbook, type ImportDiff, type ParseResult } from "@/lib/price-import";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const ROUNDING = [
  { value: "1", label: "Nærmeste krone" },
  { value: "5", label: "Nærmeste 5 kroner" },
  { value: "10", label: "Nærmeste 10 kroner" },
  { value: "0.01", label: "Øre" },
] as const;

/** Same grense som prisjusteringa over – høgare er nesten alltid ein tastefeil. */
const MAX_MARKUP = 1000;

/** Over dette heng nettlesaren på arrayBuffer() lenge nok til at folk trur appen er død. */
const MAX_BYTES = 20 * 1024 * 1024;

const ACCEPTED = /\.(xlsx|xls|csv)$/i;

/** Lange lister blir eit tapet. Resten blir talt opp i staden for å teiknast. */
const MAX_ROWS = 50;

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${num(bytes / (1024 * 1024), 1)} MB` : `${num(bytes / 1024, 0)} kB`;

const message = (e: unknown) => (e instanceof Error ? e.message : "Ukjent feil");

/** Parsinga er synkron og held hovudtråden. Vi ventar på ei teikning først, slik
 *  at spinnaren rekk å kome opp i staden for at flata står frosen. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="hm-stat">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-0.5 text-lg font-bold leading-tight",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Felles ramme rundt tabellane: eiga vassrett scrolling så mobilen ikkje sprekk. */
function TableShell({ children, minWidth }: { children: ReactNode; minWidth: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table className={minWidth}>{children}</Table>
    </div>
  );
}

function MoreRow({ total, span }: { total: number; span: number }) {
  if (total <= MAX_ROWS) return null;
  return (
    <TableRow>
      <TableCell colSpan={span} className="text-sm text-muted-foreground">
        … og {num(total - MAX_ROWS, 0)} til
      </TableCell>
    </TableRow>
  );
}

export function PriceImport() {
  const qc = useQueryClient();
  const settings = useSettings();
  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // null = feltet er ikkje rørt, og då skal det følgje påslaget frå
  // innstillingane heilt til admin skriv noko sjølv.
  const [percentEdit, setPercentEdit] = useState<string | null>(null);
  const [roundTo, setRoundTo] = useState("1");
  const [categoryId, setCategoryId] = useState("");

  const [updateOpen, setUpdateOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const percentText = percentEdit ?? String(settings.data?.markup_percent ?? 0).replace(".", ",");
  const percentValue = percentText.trim() ? parseNum(percentText) : null;
  const percentOk = percentValue !== null && percentValue >= 0 && percentValue <= MAX_MARKUP;

  // Tabellen skal ikkje tømme seg medan brukaren slettar sifferet for å skrive
  // eit nytt, så vi held på det siste påslaget som gav meining.
  const lastPercent = useRef(0);
  if (percentOk) lastPercent.current = percentValue;
  const percent = percentOk ? percentValue : lastPercent.current;
  const round = Number(roundTo) || 1;

  const diff = useMemo<ImportDiff | null>(() => {
    if (!parsed || !types.data) return null;
    return diffAgainstCatalog(parsed.rows, types.data, { markupPercent: percent, roundTo: round });
  }, [parsed, types.data, percent, round]);

  const changed = diff?.changed ?? [];
  const created = diff?.created ?? [];
  const missing = diff?.missing ?? [];
  const categoryName = (categories.data ?? []).find((c) => c.id === categoryId)?.name ?? "varegruppen";
  const roundLabel = (ROUNDING.find((r) => r.value === roundTo)?.label ?? "nærmeste krone").toLowerCase();

  /* ------------------------------------------------------------------ fil */

  async function readFile(picked: File | null | undefined) {
    if (!picked) return;
    setFile(picked);
    setParsed(null);
    setParseError(null);

    if (!ACCEPTED.test(picked.name)) {
      setParseError("Filen må være et regneark – .xlsx, .xls eller .csv.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setParseError(
        `Filen er ${fileSize(picked.size)}, og grensen er 20 MB. Be om prislisten som et rent regneark uten bilder, eller del den opp.`,
      );
      return;
    }

    setParsing(true);
    try {
      await nextPaint();
      const buffer = await picked.arrayBuffer();
      setParsed(parsePriceWorkbook(buffer));
    } catch (e) {
      setParseError(message(e));
    } finally {
      setParsing(false);
    }
  }

  const reset = () => {
    setFile(null);
    setParsed(null);
    setParseError(null);
  };

  /* -------------------------------------------------------------- handlingar */

  const update = useMutation({
    mutationFn: () =>
      importCosts(
        changed.map((l) => ({ sku: l.sku, cost: l.newCost })),
        percent,
        round,
      ),
    onSuccess: (res) => {
      setUpdateOpen(false);
      toast.success(`${num(res.updated, 0)} varer fikk ny pris`, {
        description:
          res.unmatched.length > 0
            ? `${num(res.unmatched.length, 0)} varenummer ble ikke funnet i katalogen og står urørt.`
            : "Navn, dimensjon, hylleplass og beholdning står som før.",
      });
      // Diffen blir rekna på nytt så snart den ferske katalogen er inne, slik at
      // tala på skjermen framleis stemmer med det som faktisk ligg i basen.
      qc.invalidateQueries({ queryKey: QK.types });
    },
    onError: (e: unknown) => toast.error("Klarte ikke å oppdatere prisene", { description: message(e) }),
  });

  const create = useMutation({
    mutationFn: () =>
      createPipeTypes(
        created.map((l) => ({
          category_id: categoryId,
          name: l.name,
          dimension: l.dimension,
          sku: l.sku,
          qr_slug: l.qrSlug,
          unit: l.unit,
          cost_price: l.newCost,
          price: l.newPrice,
          stock: 0,
          low_stock_threshold: 0,
          active: true,
        })),
      ),
    onSuccess: (count) => {
      setCreateOpen(false);
      toast.success(`${num(count, 0)} nye varer ble opprettet`, {
        description: "Beholdningen står på 0 til dere teller opp under Lager.",
      });
      qc.invalidateQueries({ queryKey: QK.types });
    },
    onError: (e: unknown) => toast.error("Klarte ikke å opprette varene", { description: message(e) }),
  });

  const busy = update.isPending || create.isPending;

  /* ------------------------------------------------------------------ flate */

  return (
    <Card className="hm-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Importer prisliste</CardTitle>
        <p className="text-sm text-muted-foreground">
          Slipp Excel-arket fra Brødrene Dahl her, så ser du nøyaktig hva som endrer seg før noe blir lagret.
          Varenummeret er nøkkelen. Navn, dimensjon, hylleplass og beholdning i katalogen blir ikke rørt av en
          import.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ------------------------------------------------------- droppfelt */}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            // Nullstill feltet, elles gir same fila om att ingen change-hending
            // – og då ser det ut som ingenting skjedde.
            e.target.value = "";
            void readFile(picked);
          }}
        />

        {!parsed ? (
          <button
            type="button"
            disabled={parsing}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void readFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              // Barna må sleppe musehendingane, elles blinkar uthevinga kvar gong
              // fila blir dregen over ikonet eller teksten inne i feltet.
              "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center transition-colors [&_*]:pointer-events-none",
              "hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              dragging && "border-primary bg-primary/5",
              parsing && "pointer-events-none opacity-70",
            )}
          >
            {parsing ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-semibold text-foreground">Leser arket …</span>
                <span className="text-xs text-muted-foreground">
                  Store prislister kan ta noen sekunder. Ingenting er lagret ennå.
                </span>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-semibold text-foreground">
                  Dra prislisten hit, eller trykk for å velge fil
                </span>
                <span className="text-xs text-muted-foreground">Excel (.xlsx, .xls) eller .csv – maks 20 MB</span>
              </>
            )}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{file?.name}</p>
              <p className="text-xs text-muted-foreground">
                {file ? fileSize(file.size) : "–"} · {num(parsed.rows.length, 0)} varelinjer fra{" "}
                {num(parsed.sheetCount, 0)} {parsed.sheetCount === 1 ? "side" : "sider"}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-9" onClick={reset} disabled={busy}>
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Velg en annen fil
            </Button>
          </div>
        )}

        {/* Feil frå parsinga blir ståande – ein toast rekk ingen å lese ferdig */}
        {parseError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-destructive">Klarte ikke å lese filen</p>
                <p className="text-sm text-muted-foreground">{parseError}</p>
                <Button variant="outline" size="sm" className="h-9" onClick={() => inputRef.current?.click()}>
                  Velg en annen fil
                </Button>
              </div>
            </div>
          </div>
        )}

        {parsed && (
          <>
            {/* --------------------------------------------- innstillingar */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="imp-paaslag">Påslag (%)</Label>
                <Input
                  id="imp-paaslag"
                  className="h-11 tabular"
                  inputMode="decimal"
                  value={percentText}
                  onChange={(e) => setPercentEdit(e.target.value)}
                  aria-invalid={!percentOk}
                />
                {percentOk ? (
                  <p className="text-xs text-muted-foreground">
                    Salgsprisen blir regnet ut av innkjøpsprisen i filen. Startverdien er påslaget fra
                    innstillingene.
                  </p>
                ) : (
                  <p className="text-xs text-destructive">Påslaget må være et tall mellom 0 og {MAX_MARKUP}.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="imp-avrunding">Avrunding</Label>
                <Select value={roundTo} onValueChange={setRoundTo}>
                  <SelectTrigger id="imp-avrunding" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUNDING.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Tabellene under regnes om med en gang du endrer.</p>
              </div>
            </div>

            {parsed.warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {parsed.warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* ------------------------------------------- oppsummering */}
            {types.isLoading || !diff ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Stat label="Får ny pris" value={num(changed.length, 0)} />
                  <Stat label="Uendret" value={num(diff.unchanged.length, 0)} muted />
                  <Stat label="Nye varer i filen" value={num(created.length, 0)} />
                  <Stat label="I katalogen, ikke i filen" value={num(missing.length, 0)} muted />
                </div>

                <Tabs defaultValue="endres">
                  <TabsList className="flex h-auto w-full flex-wrap justify-start">
                    <TabsTrigger value="endres">Endres ({num(changed.length, 0)})</TabsTrigger>
                    <TabsTrigger value="nye">Nye ({num(created.length, 0)})</TabsTrigger>
                    <TabsTrigger value="mangler">Mangler i filen ({num(missing.length, 0)})</TabsTrigger>
                  </TabsList>

                  {/* --------------------------------------------- endres */}
                  <TabsContent value="endres" className="space-y-2">
                    {changed.length === 0 ? (
                      <p className="py-4 text-sm text-muted-foreground">
                        Ingen av varene i katalogen har fått ny innkjøpspris i denne filen.
                      </p>
                    ) : (
                      <TableShell minWidth="min-w-[44rem]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Varenr</TableHead>
                            <TableHead>Vare</TableHead>
                            <TableHead className="text-right">Innkjøp</TableHead>
                            <TableHead className="text-right">Pris</TableHead>
                            <TableHead className="text-right">Endring</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changed.slice(0, MAX_ROWS).map((l) => {
                            const pct = l.oldCost ? ((l.newCost - l.oldCost) / l.oldCost) * 100 : null;
                            const up = pct !== null && pct > 0;
                            return (
                              <TableRow key={l.sku}>
                                <TableCell className="tabular text-sm text-muted-foreground">{l.sku}</TableCell>
                                <TableCell className="font-medium">{pipeLabel(l.name, l.dimension)}</TableCell>
                                <TableCell className="tabular whitespace-nowrap text-right text-sm">
                                  <span className="text-muted-foreground">{kr(l.oldCost)}</span>
                                  <ArrowRight
                                    className="mx-1 inline h-3 w-3 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                  <span className="font-semibold text-foreground">{kr(l.newCost)}</span>
                                </TableCell>
                                <TableCell className="tabular whitespace-nowrap text-right text-sm">
                                  <span className="text-muted-foreground">{kr(l.oldPrice)}</span>
                                  <ArrowRight
                                    className="mx-1 inline h-3 w-3 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                  <span className="font-semibold text-foreground">{kr(l.newPrice)}</span>
                                </TableCell>
                                {/* Innkjøpspris opp er ikkje "dårleg" og ned er ikkje "bra" – det
                                    er berre ei retning. Difor pil og utheving, ikkje raudt og grønt. */}
                                <TableCell className="tabular whitespace-nowrap text-right text-sm font-semibold">
                                  {pct === null ? (
                                    <span className="font-normal text-muted-foreground">Ny</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">
                                      {up ? (
                                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                                      ) : (
                                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                                      )}
                                      {num(Math.abs(pct), 1)} %
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <MoreRow total={changed.length} span={5} />
                        </TableBody>
                      </TableShell>
                    )}
                  </TabsContent>

                  {/* ------------------------------------------------ nye */}
                  <TabsContent value="nye" className="space-y-2">
                    {created.length === 0 ? (
                      <p className="py-4 text-sm text-muted-foreground">
                        Alle varenumrene i filen finnes allerede i katalogen.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Navnene er foreslått ut fra beskrivelsen i arket. Du kan rette dem etterpå under Lager.
                        </p>
                        <TableShell minWidth="min-w-[42rem]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Varenr</TableHead>
                              <TableHead>Foreslått navn</TableHead>
                              <TableHead>Dimensjon</TableHead>
                              <TableHead>Enhet</TableHead>
                              <TableHead className="text-right">Innkjøp</TableHead>
                              <TableHead className="text-right">Pris</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {created.slice(0, MAX_ROWS).map((l) => (
                              <TableRow key={l.sku}>
                                <TableCell className="tabular text-sm text-muted-foreground">{l.sku}</TableCell>
                                <TableCell className="font-medium">{l.name}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {l.dimension ?? "–"}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{l.unit}</TableCell>
                                <TableCell className="tabular text-right text-sm text-muted-foreground">
                                  {kr(l.newCost)}
                                </TableCell>
                                <TableCell className="tabular text-right text-sm font-semibold">
                                  {kr(l.newPrice)}
                                </TableCell>
                              </TableRow>
                            ))}
                            <MoreRow total={created.length} span={6} />
                          </TableBody>
                        </TableShell>
                      </>
                    )}
                  </TabsContent>

                  {/* -------------------------------------------- mangler */}
                  <TabsContent value="mangler" className="space-y-2">
                    {missing.length === 0 ? (
                      <p className="py-4 text-sm text-muted-foreground">
                        Alle varene i katalogen står også i filen.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Disse står i katalogen, men ikke i filen. De kan være utgått hos grossisten – eller
                          bare mangle i akkurat dette arket. Ingenting blir slettet automatisk; vil du fjerne en
                          vare, gjør du det selv under Lager.
                        </p>
                        <TableShell minWidth="min-w-[28rem]">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Varenr</TableHead>
                              <TableHead>Vare</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {missing.slice(0, MAX_ROWS).map((m) => (
                              <TableRow key={m.sku}>
                                <TableCell className="tabular text-sm text-muted-foreground">{m.sku}</TableCell>
                                <TableCell className="font-medium">{pipeLabel(m.name, m.dimension)}</TableCell>
                              </TableRow>
                            ))}
                            <MoreRow total={missing.length} span={2} />
                          </TableBody>
                        </TableShell>
                      </>
                    )}
                  </TabsContent>
                </Tabs>

                {/* ------------------------------------------ handlingar */}
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      className="h-11"
                      onClick={() => setUpdateOpen(true)}
                      disabled={changed.length === 0 || !percentOk || busy}
                    >
                      {update.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      Oppdater prisene
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Skriver ny innkjøpspris og ny salgspris på {num(changed.length, 0)} varer.
                    </p>
                  </div>

                  {created.length > 0 && (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[14rem] space-y-1.5">
                        <Label htmlFor="imp-gruppe">Varegruppe for de nye varene</Label>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                          <SelectTrigger id="imp-gruppe" className="h-11">
                            <SelectValue placeholder="Velg varegruppe" />
                          </SelectTrigger>
                          <SelectContent>
                            {(categories.data ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => setCreateOpen(true)}
                        disabled={!categoryId || busy}
                      >
                        {create.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <PackagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        {created.length === 1
                          ? "Opprett 1 ny vare"
                          : `Opprett ${num(created.length, 0)} nye varer`}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {categoryId
                          ? "Du kan flytte enkeltvarer til en annen gruppe etterpå."
                          : "Velg en varegruppe før du oppretter."}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>

      {/* ------------------------------------------------------- dialogar */}
      <AlertDialog open={updateOpen} onOpenChange={(o) => !update.isPending && setUpdateOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oppdatere prisene på {num(changed.length, 0)} varer?</AlertDialogTitle>
            <AlertDialogDescription>
              Varene får innkjøpsprisen fra filen, og salgsprisen blir regnet ut med {num(percent, 2)} % påslag,
              avrundet til {roundLabel}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Navn, dimensjon, hylleplass og beholdning blir ikke rørt – bare de to prisene. Har dere rettet et
              navn for hånd, står det slik dere skrev det.
            </li>
            <li>
              Bestillinger som alt er sendt inn endres ikke. Hver ordrelinje har sin egen pris fra dagen
              bestillingen kom inn, og den skal stå slik den var.
            </li>
            <li>
              De {num(created.length, 0)} nye varene i filen blir ikke opprettet av denne knappen, og de{" "}
              {num(missing.length, 0)} varene som mangler i filen blir ikke slettet.
            </li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Dialogen skal stå til svaret er inne, elles rekk ingen å sjå at noko gjekk gale.
                e.preventDefault();
                update.mutate();
              }}
              disabled={update.isPending}
            >
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Oppdater prisene
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={createOpen} onOpenChange={(o) => !create.isPending && setCreateOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opprette {num(created.length, 0)} nye varer?</AlertDialogTitle>
            <AlertDialogDescription>
              Varene blir lagt i «{categoryName}» med navn og dimensjon foreslått ut fra beskrivelsen i filen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Beholdningen blir satt til 0. Varene må telles opp under Lager før kunden ser dem som noe annet
              enn tomt.
            </li>
            <li>
              Hver vare får sin egen QR-kode. Skriv ut etikettene under QR når varene har fått hylleplass.
            </li>
            <li>Er et navn feil, kan du rette det under Lager – det påvirker ikke prisen.</li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={create.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              disabled={create.isPending}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Opprett varene
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
