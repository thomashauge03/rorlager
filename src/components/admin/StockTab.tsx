// Lagerfana: her har admin full kontroll på røra – beholdning, priser, QR-koder
// og kategorier. Beholdninga blir aldri endra med eit vanleg lagre-kall etter at
// varen er oppretta; alt går gjennom justering eller opptelling, slik at
// lagerloggen fortel heile historia.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ClipboardCheck,
  Coins,
  History,
  Layers,
  ListPlus,
  Loader2,
  Minus,
  MoreHorizontal,
  Package,
  PackageX,
  Pencil,
  Plus,
  ScanLine,
  Search,
  FileSpreadsheet,
  ShoppingBasket,
  Tag,
  Trash2,
} from "lucide-react";
import { InnkjopPanel } from "@/components/admin/InnkjopPanel";
import { Prishistorikk } from "@/components/admin/EndringsLogg";
import { StatistikkPanel } from "@/components/admin/StatistikkPanel";
import { InventurPanel } from "@/components/admin/InventurPanel";
import { SkannVare } from "@/components/admin/SkannVare";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { StockBadge } from "@/components/StatusBadge";
import { QuantityInput } from "@/components/QuantityInput";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { dateTime, kr, krShort, longDate, num, parseNum, pipeLabel, qtyLabel } from "@/lib/format";
import { avrundingTekst, prisTekst, salsprisFraInnkjop } from "@/lib/prisoversikt";
import { useOfficeSettings } from "@/lib/settings";
import {
  filterAndSortPipes,
  ikkeISisteListe,
  sistePrislisteDato,
  stockStatus,
  stockTotals,
  salsverdi,
  vareverdi,
  varselgrense,
  type PipeSort,
  type VarselStandard,
} from "@/lib/stock";
import {
  QK,
  adjustStock,
  deleteCategory,
  deletePipeType,
  fetchCategories,
  fetchPipeTypes,
  fetchStockLog,
  saveCategory,
  savePipeType,
  setStock,
} from "@/lib/orders";
import type { PipeCategoryRow, PipeType, PipeTypeRow } from "@/lib/types";
import { finnDyplenke, markerOgRull } from "@/lib/dyplenke";

const SORT_OPTIONS: { key: PipeSort["key"]; label: string }[] = [
  { key: "name", label: "Navn" },
  { key: "dimension", label: "Dimensjon" },
  { key: "stock", label: "Beholdning" },
  { key: "price", label: "Pris" },
  { key: "status", label: "Status" },
  { key: "location", label: "Hylle" },
  { key: "sku", label: "Varenummer" },
  { key: "threshold", label: "Varselgrense" },
  { key: "cost", label: "Kostpris" },
  { key: "costValue", label: "Innkjøpsverdi" },
  { key: "saleValue", label: "Salgsverdi" },
  { key: "active", label: "Aktiv" },
];

const ALLE = "alle";

type Utval = "lav" | "utenPris" | "ikkeIListe" | null;
const INGEN = "ingen";

/** Standardfarge på nye kategoriar – HM-raud, så fargevelgaren aldri står tom */
const DEFAULT_COLOR = "#c81e2a";

/**
 * QR-koden står på ein etikett som blir skanna av eit kamera og av og til tasta
 * inn for hand. Difor berre a–z, 0–9 og bindestrek: æ/ø/å og mellomrom blir
 * ulike frå telefon til telefon, og ein URL med prosentkoding er umogleg å lese.
 */
const slugify = (value: string) =>
  (value ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const SLUG_OK = /^[a-z0-9-]+$/;

// ------------------------------------------------------------------- fana

export function StockTab({
  visKostpris = true,
  vare = null,
}: {
  /** Av for rolla «lager»: innkjøpsprisen er kontoret si sak. */
  visKostpris?: boolean;
  /** Dyplenke fra Innboks (lav beholdning): id-en til varen. */
  vare?: string | null;
} = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>(ALLE);
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState<PipeSort>({ key: "name", dir: "asc" });
  // Trykk på ei kolonneoverskrift: same kolonne snur retninga, ei ny startar stigande
  const sorterPå = (key: PipeSort["key"]) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  // «Vis bare disse» fra én av meldingene over lista. Ett utvalg om gangen:
  // tomme varer, varer uten salgspris, eller varer som ikke var med i siste prisliste.
  const [utval, setUtval] = useState<Utval>(null);
  const veksle = (u: Exclude<Utval, null>) => setUtval((v) => (v === u ? null : u));

  const [editing, setEditing] = useState<{ pipe: PipeType | null } | null>(null);
  const [adjust, setAdjust] = useState<{ pipe: PipeType; mode: "add" | "remove" | "count" } | null>(null);
  const [toDelete, setToDelete] = useState<PipeType | null>(null);
  const [logFor, setLogFor] = useState<PipeType | "alle" | null>(null);
  const [innkjop, setInnkjop] = useState(false);
  const [statistikk, setStatistikk] = useState(false);
  const [inventur, setInventur] = useState(false);
  const [skannVare, setSkannVare] = useState(false);

  // Ny tom array kvar render ville gjort alle useMemo-ane under verdilause
  const rows = useMemo(() => types.data ?? [], [types.data]);
  const sistePrisliste = useMemo(() => sistePrislisteDato(rows), [rows]);

  // Nøkkeltala gjeld heile lageret slik det er skrudd på no (med eller utan
  // inaktive varer), ikkje søketreffet – elles ville "0 tomme" berre bety at
  // ein har søkt vekk problemet.
  const base = useMemo(() => (showInactive ? rows : rows.filter((t) => t.active)), [rows, showInactive]);
  // Standard varselgrense frå innstillingane, for varer utan eiga
  const kontor = useOfficeSettings();
  const standard = useMemo<VarselStandard>(
    () => ({ stk: kontor.data?.low_stock_default_stk ?? 2, m: kontor.data?.low_stock_default_m ?? 10 }),
    [kontor.data?.low_stock_default_stk, kontor.data?.low_stock_default_m],
  );
  const totals = useMemo(() => stockTotals(base, standard), [base, standard]);

  const visible = useMemo(() => {
    const list = filterAndSortPipes(rows, {
      search,
      categoryId: categoryId === ALLE ? null : categoryId,
      onlyActive: !showInactive,
      sort,
      standard,
    });
    if (utval === "lav") return list.filter((t) => stockStatus(t, standard) !== "pa_lager");
    if (utval === "utenPris") return list.filter((t) => t.price === null);
    if (utval === "ikkeIListe") return list.filter((t) => ikkeISisteListe(t, sistePrisliste));
    return list;
  }, [rows, search, categoryId, showInactive, sort, utval, sistePrisliste, standard]);

  const utenPris = useMemo(() => base.filter((t) => t.price === null).length, [base]);
  const ikkeIListe = useMemo(
    () => (sistePrisliste ? base.filter((t) => ikkeISisteListe(t, sistePrisliste)).length : 0),
    [base, sistePrisliste],
  );

  /*
   * Dyplenke fra Innboks: nullstill filtrene så varen kommer med, og rull fram
   * til den når lista er tegnet. Refen gjør at et filtervalg etterpå ikke drar
   * brukeren tilbake.
   */
  const [dypMål, setDypMål] = useState<string | null>(null);
  const dypTatt = useRef<string | null>(null);
  useEffect(() => {
    if (!vare || dypTatt.current === vare || !types.data) return;
    dypTatt.current = vare;
    const t = types.data.find((x) => x.id === vare);
    if (!t) {
      toast({ title: "Fant ikke varen.", description: "Den kan være slettet." });
      return;
    }
    setSearch("");
    setCategoryId(ALLE);
    setUtval(null);
    if (!t.active) setShowInactive(true);
    setDypMål(t.id);
  }, [vare, types.data, toast]);
  useEffect(() => {
    if (!dypMål) return;
    setDypMål(null);
    const el = finnDyplenke(`vare-${dypMål}`);
    if (el) markerOgRull(el);
  }, [dypMål]);

  const activeToggle = useMutation({
    mutationFn: (args: { id: string; active: boolean }) => savePipeType({ id: args.id, active: args.active }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: QK.types });
      toast({ title: row.active ? "Varen er aktiv igjen" : "Varen er satt inaktiv" });
    },
    onError: (error: Error) => toast({ title: "Endringen ble ikke lagret", description: error.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePipeType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.types });
      setToDelete(null);
      toast({ title: "Varen er slettet" });
    },
    onError: (error: Error) => toast({ title: "Varen ble ikke slettet", description: error.message, variant: "destructive" }),
  });

  // Kategorifargen bur på kategorien, ikkje på varen, så lista må slå han opp
  const kategorifarge = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories.data ?? []) if (c.color) map.set(c.id, c.color);
    return map;
  }, [categories.data]);

  const fargeFor = (t: PipeType) => (t.category_id ? kategorifarge.get(t.category_id) ?? null : null);

  const varsel = totals.tomme + totals.snart;

  if (types.isError) {
    return (
      <div className="hm-card p-6">
        <p className="text-sm text-destructive-ink">Klarte ikke å hente lageret.</p>
        <p className="text-sm text-muted-foreground mt-1">{(types.error as Error)?.message}</p>
        <Button className="mt-4 h-11" variant="outline" onClick={() => types.refetch()}>
          Prøv igjen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ------------------------------------------------------- nøkkeltal */}
      <div className="flex flex-wrap gap-2">
        <Stat icon={<Package className="h-4 w-4" />} label="Varer" value={num(totals.varer, 0)} />
        <Stat
          icon={<PackageX className="h-4 w-4" />}
          label="Tomme"
          value={num(totals.tomme, 0)}
          tone={totals.tomme > 0 ? "bad" : undefined}
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Snart tomme"
          value={num(totals.snart, 0)}
          tone={totals.snart > 0 ? "warn" : undefined}
        />
        {visKostpris ? (
          <Stat icon={<Coins className="h-4 w-4" />} label="Lagerverdi (kostpris)" value={`${krShort(totals.verdi)} kr`} />
        ) : null}
        <Stat icon={<Coins className="h-4 w-4" />} label="Salgsverdi" value={`${krShort(totals.salsverdi)} kr`} />
        <Stat
          icon={<Tag className="h-4 w-4" />}
          label="Uten pris"
          value={num(utenPris, 0)}
          tone={utenPris > 0 ? "warn" : undefined}
        />
        {sistePrisliste ? (
          <Stat
            icon={<FileSpreadsheet className="h-4 w-4" />}
            label="Ikke i siste prisliste"
            value={num(ikkeIListe, 0)}
            tone={ikkeIListe > 0 ? "warn" : undefined}
          />
        ) : null}
      </div>

      {totals.perUnit.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Totalt på lager: {totals.perUnit.map((u) => qtyLabel(u.qty, u.unit)).join(" · ")}
        </p>
      )}

      {/* ---------------------------------------------------- varsellinje */}
      {varsel > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/60 bg-warning/10 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
          <p className="min-w-[12rem] flex-1 text-sm text-warning-ink">
            {totals.tomme > 0 && `${totals.tomme} ${totals.tomme === 1 ? "vare er tom" : "varer er tomme"}`}
            {totals.tomme > 0 && totals.snart > 0 && " og "}
            {totals.snart > 0 && `${totals.snart} ${totals.snart === 1 ? "vare er" : "varer er"} snart tom`}
            . Fyll på lageret eller sett varen inaktiv.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => veksle("lav")}
          >
            {utval === "lav" ? "Vis alle varer" : "Vis bare disse"}
          </Button>
        </div>
      )}

      {utenPris > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="min-w-[12rem] flex-1 text-sm text-foreground">
            {utenPris} {utenPris === 1 ? "vare mangler" : "varer mangler"} salgspris. Kunden ser «–» i stedet for en pris
            — legg den inn på varen, eller kjør en prisimport fra Dahl.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => veksle("utenPris")}
          >
            {utval === "utenPris" ? "Vis alle varer" : "Vis bare disse"}
          </Button>
        </div>
      )}

      {sistePrisliste && ikkeIListe > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="min-w-[12rem] flex-1 text-sm text-foreground">
            {ikkeIListe} {ikkeIListe === 1 ? "vare var" : "varer var"} ikke med i prislista fra {longDate(sistePrisliste)}.
            Prisen deres er ikke oppdatert — sjekk dem, eller rett prisen på varen.
          </p>
          <Button size="sm" variant="outline" onClick={() => veksle("ikkeIListe")}>
            {utval === "ikkeIListe" ? "Vis alle varer" : "Vis bare disse"}
          </Button>
        </div>
      )}

      {/* --------------------------------------------------------- filter */}
      <div className="hm-card p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="lager-sok" className="sr-only">
              Søk etter vare
            </Label>
            <Input
              id="lager-sok"
              className="h-11 pl-9"
              placeholder="Søk på navn, dimensjon, varenummer eller hylle…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-w-[10rem]">
            <Label htmlFor="lager-kategori" className="sr-only">
              Kategori
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="lager-kategori" className="h-11">
                <SelectValue placeholder="Alle kategorier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle kategorier</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[9rem]">
            <Label htmlFor="lager-sortering" className="sr-only">
              Sortering
            </Label>
            <Select value={sort.key} onValueChange={(key) => setSort((s) => ({ ...s, key: key as PipeSort["key"] }))}>
              <SelectTrigger id="lager-sortering" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.filter((o) => visKostpris || (o.key !== "cost" && o.key !== "costValue")).map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            className="h-11"
            aria-label={sort.dir === "asc" ? "Sorter synkende" : "Sorter stigende"}
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
          >
            {sort.dir === "asc" ? "Stigende" : "Synkende"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <label className="flex cursor-pointer items-center gap-2">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} aria-label="Vis inaktive varer" />
            <span className="text-sm text-foreground">Vis inaktive</span>
          </label>

          {utval && (
            <Button size="sm" variant="ghost" onClick={() => setUtval(null)}>
              {utval === "lav" ? "Fjern varselfilter" : utval === "utenPris" ? "Fjern prisfilter" : "Fjern prislistefilter"}
            </Button>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => setSkannVare(true)}>
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Skann vare
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setInventur(true)}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Inventur
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setStatistikk(true)}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Statistikk
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setInnkjop(true)}>
              <ShoppingBasket className="h-4 w-4" aria-hidden="true" />
              Innkjøpsforslag
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setLogFor("alle")}>
              <History className="h-4 w-4" aria-hidden="true" />
              Lagerlogg
            </Button>
            <Button className="h-11" onClick={() => setEditing({ pipe: null })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ny vare
            </Button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- lista */}
      {types.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="hm-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {rows.length === 0 ? "Ingen varer er lagt inn ennå." : "Ingen varer passer med filteret."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: tabell med alle tala ved sida av kvarandre */}
          <div className="hm-card hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="name" sort={sort} onSort={sorterPå}>Vare</SortHead>
                  <SortHead k="sku" sort={sort} onSort={sorterPå}>Varenr.</SortHead>
                  <SortHead k="location" sort={sort} onSort={sorterPå}>Hylle</SortHead>
                  <SortHead k="stock" sort={sort} onSort={sorterPå} align="right">Beholdning</SortHead>
                  <SortHead k="threshold" sort={sort} onSort={sorterPå} align="right">Varselgrense</SortHead>
                  <SortHead k="price" sort={sort} onSort={sorterPå} align="right">Pris</SortHead>
                  {visKostpris ? (
                    <SortHead k="cost" sort={sort} onSort={sorterPå} align="right">Kostpris</SortHead>
                  ) : null}
                  {visKostpris ? (
                    <SortHead k="costValue" sort={sort} onSort={sorterPå} align="right">Innkjøpsverdi</SortHead>
                  ) : null}
                  <SortHead k="saleValue" sort={sort} onSort={sorterPå} align="right">Salgsverdi</SortHead>
                  <SortHead k="status" sort={sort} onSort={sorterPå}>Status</SortHead>
                  <SortHead k="active" sort={sort} onSort={sorterPå} align="center">Aktiv</SortHead>
                  <TableHead className="text-right">Handling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((t) => {
                  const label = pipeLabel(t.name, t.dimension);
                  return (
                    <TableRow key={t.id} data-dyplenke={`vare-${t.id}`} className={cn(!t.active && "opacity-60")}>
                      <TableCell>
                        <p className="font-medium text-foreground">{label}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CategoryDot color={fargeFor(t)} />
                          {t.category_name ?? "Uten kategori"}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.sku || "–"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.location || "–"}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn("tabular font-semibold", t.stock < 0 && "text-destructive-ink")}>{num(t.stock)}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{t.unit}</span>
                      </TableCell>
                      <TableCell className="tabular text-right text-sm text-muted-foreground">
                        <Varselgrense vare={t} standard={standard} />
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">{t.price === null ? "–" : kr(t.price)}</TableCell>
                      {visKostpris ? (
                        <TableCell className="tabular text-right text-sm text-muted-foreground">
                          {t.cost_price === null ? "–" : kr(t.cost_price)}
                        </TableCell>
                      ) : null}
                      {visKostpris ? (
                        <TableCell className="tabular text-right text-sm text-muted-foreground">
                          {vareverdi(t) === null ? "–" : kr(vareverdi(t) as number)}
                        </TableCell>
                      ) : null}
                      <TableCell className="tabular text-right text-sm font-medium">
                        {salsverdi(t) === null ? "–" : kr(salsverdi(t) as number)}
                      </TableCell>
                      <TableCell>
                        <StockBadge status={stockStatus(t, standard)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={t.active}
                          aria-label={`Aktiv: ${label}`}
                          onCheckedChange={(v) => activeToggle.mutate({ id: t.id, active: v })}
                        />
                      </TableCell>
                      <TableCell>
                        <RowActions
                          pipe={t}
                          onAdjust={(mode) => setAdjust({ pipe: t, mode })}
                          onEdit={() => setEditing({ pipe: t })}
                          onLog={() => setLogFor(t)}
                          onDelete={() => setToDelete(t)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobil: kort, fordi ein tabell med ti kolonnar ikkje kan lesast på telefon */}
          <div className="space-y-2 md:hidden">
            {visible.map((t) => {
              const label = pipeLabel(t.name, t.dimension);
              return (
                <div key={t.id} data-dyplenke={`vare-${t.id}`} className={cn("hm-card p-3 space-y-3", !t.active && "opacity-60")}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CategoryDot color={fargeFor(t)} />
                        <span className="truncate">
                          {[t.category_name, t.sku && `Varenr. ${t.sku}`, t.location && `Hylle ${t.location}`]
                            .filter(Boolean)
                            .join(" · ") || "Uten kategori"}
                        </span>
                      </p>
                    </div>
                    <StockBadge status={stockStatus(t, standard)} />
                  </div>

                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <p>
                      <span className={cn("tabular text-xl font-bold", t.stock < 0 && "text-destructive-ink")}>{num(t.stock)}</span>
                      <span className="ml-1 text-sm text-muted-foreground">{t.unit}</span>
                    </p>
                    <p className="tabular text-sm text-muted-foreground">
                      {t.price === null ? "Ingen pris" : `${kr(t.price)} kr / ${t.unit}`}
                    </p>
                    {varselgrense(t, standard) > 0 && (
                      <p className="tabular text-xs text-muted-foreground">
                        Varsel ved {num(varselgrense(t, standard))}
                        {t.low_stock_threshold > 0 ? "" : " (standard)"}
                      </p>
                    )}
                    {salsverdi(t) !== null ? (
                      <p className="tabular text-xs text-muted-foreground">Salgsverdi {kr(salsverdi(t) as number)} kr</p>
                    ) : null}
                    {visKostpris && vareverdi(t) !== null ? (
                      <p className="tabular text-xs text-muted-foreground">Innkjøpsverdi {kr(vareverdi(t) as number)} kr</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="h-11 flex-1" onClick={() => setAdjust({ pipe: t, mode: "add" })}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Legg til
                    </Button>
                    <Button size="sm" variant="outline" className="h-11 flex-1" onClick={() => setAdjust({ pipe: t, mode: "remove" })}>
                      <Minus className="h-4 w-4" aria-hidden="true" />
                      Ta ut
                    </Button>
                    <RowActions
                      pipe={t}
                      onAdjust={(mode) => setAdjust({ pipe: t, mode })}
                      onEdit={() => setEditing({ pipe: t })}
                      onLog={() => setLogFor(t)}
                      onDelete={() => setToDelete(t)}
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 pt-1">
                    <Switch
                      checked={t.active}
                      aria-label={`Aktiv: ${label}`}
                      onCheckedChange={(v) => activeToggle.mutate({ id: t.id, active: v })}
                    />
                    <span className="text-sm text-muted-foreground">{t.active ? "Aktiv i appen" : "Skjult for kunden"}</span>
                  </label>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Viser {visible.length} av {rows.length} varer
          </p>
        </>
      )}

      {/* ----------------------------------------------------- kategoriar */}
      <CategorySection categories={categories.data ?? []} pipes={rows} />

      {/* --------------------------------------------------------- dialog */}
      {editing && (
        <PipeDialog
          pipe={editing.pipe}
          visKostpris={visKostpris}
          allPipes={rows}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {adjust && <AdjustDialog pipe={adjust.pipe} mode={adjust.mode} onClose={() => setAdjust(null)} />}
      {innkjop ? <InnkjopPanel varer={rows} visKostpris={visKostpris} onClose={() => setInnkjop(false)} /> : null}
      {statistikk ? <StatistikkPanel varer={rows} visKostpris={visKostpris} onClose={() => setStatistikk(false)} /> : null}
      {inventur ? <InventurPanel varer={rows} visKostpris={visKostpris} onClose={() => setInventur(false)} /> : null}
      {skannVare ? (
        <SkannVare
          varer={rows}
          onClose={() => setSkannVare(false)}
          onJuster={(pipe, mode) => {
            setSkannVare(false);
            setAdjust({ pipe, mode });
          }}
        />
      ) : null}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette {toDelete ? pipeLabel(toDelete.name, toDelete.dimension) : "varen"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Gamle bestillinger beholder navn, dimensjon og pris slik de var, men koblingen til varen forsvinner – og da
              kan ikke uttakene telles tilbake på lageret. QR-koden som henger på hylla slutter å virke. Skal varen bare
              ut av appen, er det bedre å sette den inaktiv.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete.id);
              }}
            >
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Slett varen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StockLogSheet target={logFor} onClose={() => setLogFor(null)} />
    </div>
  );
}

// ------------------------------------------------------------- småbitar

/**
 * Kategorifargen som ein liten prikk framfor teksten. Admin kan velje kva farge
 * som helst, så han blir aldri lagd bak tekst – då kunne kontrasten bli borte.
 * Kategoriar utan farge får ingen prikk, og linja ser like heil ut.
 */
function CategoryDot({ color }: { color: string | null }) {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full border border-foreground/15"
      style={{ backgroundColor: color }}
    />
  );
}

/** Varas eiga grense, eller standarden for eininga i svakare skrift. */
function Varselgrense({ vare, standard }: { vare: PipeType; standard: VarselStandard }) {
  if (vare.low_stock_threshold > 0) return <>{num(vare.low_stock_threshold)}</>;
  const g = varselgrense(vare, standard);
  if (g <= 0) return <>–</>;
  return (
    <span className="opacity-60" title="Standard fra innstillingene – varen har ingen egen grense">
      {num(g)}
      <span className="sr-only"> (standard)</span>
    </span>
  );
}

/** Kolonneoverskrift som sorterer tabellen. Same sortering som nedtrekket over lista. */
function SortHead({
  k,
  sort,
  onSort,
  align = "left",
  children,
}: {
  k: PipeSort["key"];
  sort: PipeSort;
  onSort: (key: PipeSort["key"]) => void;
  align?: "left" | "right" | "center";
  children: ReactNode;
}) {
  const aktiv = sort.key === k;
  const Ikon = !aktiv ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={aktiv ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "right" && "text-right", align === "center" && "text-center")}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "-mx-2 inline-flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-muted hover:text-foreground",
          aktiv && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        <Ikon className={cn("h-3.5 w-3.5 shrink-0", !aktiv && "opacity-40")} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "bad" | "warn";
}) {
  return (
    <div className="hm-stat">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p
        className={cn(
          "tabular text-xl font-bold text-foreground",
          tone === "bad" && "text-destructive-ink",
          tone === "warn" && "text-warning-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RowActions({
  pipe,
  onAdjust,
  onEdit,
  onLog,
  onDelete,
}: {
  pipe: PipeType;
  onAdjust: (mode: "add" | "remove" | "count") => void;
  onEdit: () => void;
  onLog: () => void;
  onDelete: () => void;
}) {
  const label = pipeLabel(pipe.name, pipe.dimension);
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="hidden h-9 w-9 md:inline-flex"
        aria-label={`Legg til på lageret: ${label}`}
        onClick={() => onAdjust("add")}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="hidden h-9 w-9 md:inline-flex"
        aria-label={`Ta ut fra lageret: ${label}`}
        onClick={() => onAdjust("remove")}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-11 w-11 md:h-9 md:w-9" aria-label={`Flere valg for ${label}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAdjust("count")}>
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Tell opp
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLog}>
            <History className="h-4 w-4" aria-hidden="true" />
            Lagerlogg
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Rediger
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive-ink focus:text-destructive-ink" onSelect={onDelete}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Slett
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ------------------------------------------------------- lagerjustering

const ADJUST_TEXT = {
  add: { title: "Legg til på lageret", cta: "Legg til", reason: "påfyll" },
  remove: { title: "Ta ut fra lageret", cta: "Ta ut", reason: "uttak" },
  count: { title: "Tell opp", cta: "Lagre opptelling", reason: "opptelling" },
} as const;

function AdjustDialog({
  pipe,
  mode,
  onClose,
}: {
  pipe: PipeType;
  mode: "add" | "remove" | "count";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const text = ADJUST_TEXT[mode];

  // Opptelling startar på dagens tal: som regel stemmer det nesten, og då er
  // det færre tastetrykk å rette enn å skrive alt på nytt.
  const [value, setValue] = useState<number | null>(mode === "count" ? pipe.stock : null);
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = note.trim() || undefined;

      // Opptelling kan lande på null – det er eit gyldig svar. Ei justering på
      // null er derimot berre eit tomt felt, og skal ikkje bli ei loggføring.
      if (mode === "count") {
        if (value === null || value < 0) throw new Error(`Skriv inn hvor mange ${pipe.unit} som ligger på hylla.`);
        return setStock(pipe.id, value, trimmed);
      }

      if (value === null || value <= 0) throw new Error(`Skriv inn hvor mange ${pipe.unit} det gjelder.`);
      return adjustStock(pipe.id, mode === "add" ? value : -value, text.reason, trimmed);
    },
    onSuccess: (balance) => {
      queryClient.invalidateQueries({ queryKey: QK.types });
      queryClient.invalidateQueries({ queryKey: QK.stockLog });
      toast({
        title: `Ny beholdning: ${qtyLabel(balance, pipe.unit)}`,
        description: pipeLabel(pipe.name, pipe.dimension),
      });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "Beholdningen ble ikke endret", description: error.message, variant: "destructive" }),
  });

  const etter = value === null ? pipe.stock : mode === "count" ? value : mode === "add" ? pipe.stock + value : pipe.stock - value;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>
            {pipeLabel(pipe.name, pipe.dimension)} · på lager nå: {qtyLabel(pipe.stock, pipe.unit)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <QuantityInput value={value} onChange={setValue} unit={pipe.unit} autoFocus />

          <p className="tabular text-sm text-muted-foreground">
            Etter {mode === "count" ? "opptelling" : "endring"}:{" "}
            <span className={cn("font-semibold text-foreground", etter < 0 && "text-destructive-ink")}>
              {qtyLabel(Math.round(etter * 100) / 100, pipe.unit)}
            </span>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="just-notat">Notat (valgfritt)</Label>
            <Input
              id="just-notat"
              className="h-12"
              placeholder={mode === "count" ? "F.eks. årlig opptelling" : "F.eks. levering fra Wavin"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={onClose}>
            Avbryt
          </Button>
          <Button className="h-12" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : text.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------- ny/rediger

type PipeForm = {
  category_id: string;
  name: string;
  dimension: string;
  sku: string;
  ean: string;
  qr_slug: string;
  unit: string;
  price: string;
  cost_price: string;
  stock: string;
  low_stock_threshold: string;
  location: string;
  description: string;
  active: boolean;
};

const formFrom = (pipe: PipeType | null): PipeForm => ({
  category_id: pipe?.category_id ?? INGEN,
  name: pipe?.name ?? "",
  dimension: pipe?.dimension ?? "",
  sku: pipe?.sku ?? "",
  ean: pipe?.ean ?? "",
  qr_slug: pipe?.qr_slug ?? "",
  unit: pipe?.unit ?? "m",
  price: pipe?.price === null || pipe?.price === undefined ? "" : String(pipe.price).replace(".", ","),
  cost_price: pipe?.cost_price === null || pipe?.cost_price === undefined ? "" : String(pipe.cost_price).replace(".", ","),
  stock: "0",
  low_stock_threshold: pipe ? String(pipe.low_stock_threshold).replace(".", ",") : "0",
  location: pipe?.location ?? "",
  description: pipe?.description ?? "",
  active: pipe?.active ?? true,
});

/**
 * Ny eller rediger vare. Forslagsfana opnar han òg, med namn, dimensjon og
 * eining frå forslaget fylt inn (`initial`), og får vara tilbake i `onSaved`.
 */
export function PipeDialog({
  pipe,
  allPipes,
  categories,
  onClose,
  initial,
  onSaved,
  visKostpris = true,
}: {
  pipe: PipeType | null;
  allPipes: PipeType[];
  categories: PipeCategoryRow[];
  onClose: () => void;
  initial?: Partial<Pick<PipeForm, "name" | "dimension" | "unit">>;
  onSaved?: (row: PipeTypeRow) => void | Promise<void>;
  /** Av for rolla «lager». Feltet blir ikkje vist, og verdien står urørt. */
  visKostpris?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<PipeForm>(() => {
    const f = { ...formFrom(pipe), ...initial };
    return initial && !pipe ? { ...f, qr_slug: slugify(`${f.name} ${f.dimension}`) } : f;
  });
  // Så lenge admin ikkje har rørt QR-koden sjølv, følgjer ho namnet. Er ho først
  // endra manuelt – eller står på ein etikett som alt heng i hylla – lèt vi ho vere.
  const [slugLocked, setSlugLocked] = useState(!!pipe);

  const set = (patch: Partial<PipeForm>) => setForm((f) => ({ ...f, ...patch }));

  // Avansen frå innstillingane. Ei ny vare får salsprisen rekna ut av
  // innkjøpsprisen til nokon skriv ein pris sjølv; ei eksisterande vare blir
  // ikkje rørt utan at nokon ber om det.
  const kontor = useOfficeSettings();
  const avanse = visKostpris && !kontor.isPlaceholderData ? (kontor.data?.markup_percent ?? null) : null;
  const faktor = pipe?.prishopp_faktor ?? 1;
  const avrunding = { steg: kontor.data?.price_round_to ?? 1, opp: kontor.data?.price_round_up ?? true };
  const [prisAuto, setPrisAuto] = useState(!pipe);
  const utrekna = (kostTekst: string) =>
    avanse === null ? null : salsprisFraInnkjop(parseNum(kostTekst), avanse, faktor, avrunding);

  const setKostpris = (cost_price: string) =>
    setForm((f) => {
      const ny = utrekna(cost_price);
      return prisAuto && avanse !== null ? { ...f, cost_price, price: ny === null ? "" : prisTekst(ny) } : { ...f, cost_price };
    });

  // Avansen kjem frå basen etter at dialogen er open. Har nokon alt skrive
  // innkjøpsprisen, skal salsprisen fylgje med når han kjem.
  useEffect(() => {
    if (!prisAuto || avanse === null) return;
    setForm((f) => {
      const ny = utrekna(f.cost_price);
      return ny === null ? f : { ...f, price: prisTekst(ny) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avanse]);

  const forslagPris = utrekna(form.cost_price);
  const prisAvvik = forslagPris !== null && Math.abs((parseNum(form.price) ?? NaN) - forslagPris) >= 0.005;

  const setName = (name: string) =>
    setForm((f) => ({ ...f, name, qr_slug: slugLocked ? f.qr_slug : slugify(`${name} ${f.dimension}`) }));

  const setDimension = (dimension: string) =>
    setForm((f) => ({ ...f, dimension, qr_slug: slugLocked ? f.qr_slug : slugify(`${f.name} ${dimension}`) }));

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const slug = form.qr_slug.trim().toLowerCase();
      const sku = form.sku.trim();
      const ean = form.ean.replace(/\s/g, "");

      if (!name) throw new Error("Varen må ha et navn.");
      if (!slug) throw new Error("QR-koden kan ikke være tom.");
      if (!SLUG_OK.test(slug)) throw new Error("QR-koden kan bare inneholde a–z, 0–9 og bindestrek.");

      const slugTaken = allPipes.find((t) => t.qr_slug === slug && t.id !== pipe?.id);
      if (slugTaken) throw new Error(`QR-koden «${slug}» er allerede i bruk på ${pipeLabel(slugTaken.name, slugTaken.dimension)}.`);

      const skuTaken = sku && allPipes.find((t) => (t.sku ?? "").toLowerCase() === sku.toLowerCase() && t.id !== pipe?.id);
      if (skuTaken) throw new Error(`Varenummeret «${sku}» er allerede i bruk på ${pipeLabel(skuTaken.name, skuTaken.dimension)}.`);
      if (ean && !/^\d{8,14}$/.test(ean)) throw new Error("Strekkoden må være 8–14 siffer.");
      const eanTaken = ean && allPipes.find((t) => t.ean === ean && t.id !== pipe?.id);
      if (eanTaken) throw new Error(`Strekkoden er allerede i bruk på ${pipeLabel(eanTaken.name, eanTaken.dimension)}.`);

      const patch: Partial<PipeTypeRow> & { id?: string } = {
        id: pipe?.id,
        category_id: form.category_id === INGEN ? null : form.category_id,
        name,
        dimension: form.dimension.trim() || null,
        sku: sku || null,
        ean: ean || null,
        qr_slug: slug,
        unit: form.unit,
        price: parseNum(form.price),
        cost_price: parseNum(form.cost_price),
        low_stock_threshold: parseNum(form.low_stock_threshold) ?? 0,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        active: form.active,
      };

      // Beholdninga blir berre sett ved oppretting. Seinare skal ho endrast med
      // justering eller opptelling, elles får lagerloggen hol i historia.
      if (!pipe) patch.stock = parseNum(form.stock) ?? 0;

      return savePipeType(patch);
    },
    onSuccess: async (row) => {
      queryClient.invalidateQueries({ queryKey: QK.types });
      queryClient.invalidateQueries({ queryKey: QK.stockLog });
      toast({ title: pipe ? "Varen er lagret" : "Varen er lagt inn", description: pipeLabel(row.name, row.dimension) });
      await onSaved?.(row);
      onClose();
    },
    onError: (error: Error) => toast({ title: "Varen ble ikke lagret", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pipe ? "Rediger vare" : "Ny vare"}</DialogTitle>
          <DialogDescription>
            {pipe
              ? "Beholdningen endres med «Legg til», «Ta ut» eller «Tell opp», slik at lagerloggen stemmer."
              : "QR-koden blir foreslått ut fra navn og dimensjon, men kan endres."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vare-kategori">Kategori</Label>
            <Select value={form.category_id} onValueChange={(v) => set({ category_id: v })}>
              <SelectTrigger id="vare-kategori" className="h-11" aria-describedby="vare-kategori-hjelp">
                <SelectValue placeholder="Uten kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INGEN}>Uten kategori</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Ei vare frå eit forslag skal finnast att neste gong. Utan
                kategori står ho berre under «Alle», og då er det lett å
                leite forbi henne og leggje inn same forslag på nytt. */}
            {!pipe && form.category_id === INGEN ? (
              <p id="vare-kategori-hjelp" className="text-xs text-muted-foreground">
                Velg kategori, så havner varen under riktig knapp på forsiden og blir funnet neste gang.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-navn">Navn</Label>
            <Input id="vare-navn" className="h-11" value={form.name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-dimensjon">Dimensjon</Label>
            <Input
              id="vare-dimensjon"
              className="h-11"
              placeholder="110 mm"
              value={form.dimension}
              onChange={(e) => setDimension(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-sku">Varenummer</Label>
            <Input id="vare-sku" className="h-11" value={form.sku} onChange={(e) => set({ sku: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-ean">Strekkode (EAN)</Label>
            <Input
              id="vare-ean"
              className="h-11 tabular"
              inputMode="numeric"
              placeholder="Fra emballasjen, valgfritt"
              value={form.ean}
              onChange={(e) => set({ ean: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Da kjenner skanneren igjen varen på strekkoden fra produsenten.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-slug">QR-kode</Label>
            <Input
              id="vare-slug"
              className="h-11"
              value={form.qr_slug}
              onChange={(e) => {
                setSlugLocked(true);
                set({ qr_slug: slugify(e.target.value) });
              }}
            />
            <p className="text-xs text-muted-foreground">Adressen blir /r/{form.qr_slug || "…"}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-enhet">Enhet</Label>
            <Select value={form.unit} onValueChange={(v) => set({ unit: v })}>
              <SelectTrigger id="vare-enhet" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m">Meter (m)</SelectItem>
                <SelectItem value="stk">Stykk (stk)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vare-hylle">Hylleplass</Label>
            <Input
              id="vare-hylle"
              className="h-11"
              placeholder="A-01"
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
            />
          </div>

          {visKostpris ? (
            <div className="space-y-1.5">
              <Label htmlFor="vare-kostpris">Innkjøpspris fra Dahl per {form.unit} (kr)</Label>
              <Input
                id="vare-kostpris"
                className="h-11 tabular"
                inputMode="decimal"
                placeholder="Ingen innkjøpspris"
                value={form.cost_price}
                onChange={(e) => setKostpris(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Uten mva.</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="vare-pris">
              {visKostpris ? "Salgspris eks. mva" : "Pris"} per {form.unit} (kr)
            </Label>
            <Input
              id="vare-pris"
              className="h-11 tabular"
              inputMode="decimal"
              placeholder="Ingen pris"
              value={form.price}
              onChange={(e) => {
                setPrisAuto(false);
                set({ price: e.target.value });
              }}
            />
            {avanse !== null ? (
              prisAuto ? (
                <p className="text-xs text-muted-foreground">
                  Regnes ut: innkjøpspris + {num(avanse, 2)} % avanse, avrundet{" "}
                  {avrunding.opp && avrunding.steg !== 0.01 ? avrundingTekst(avrunding) : `til ${avrundingTekst(avrunding)}`}. Skriv
                  en annen pris for å sette den selv.
                </p>
              ) : prisAvvik && forslagPris !== null ? (
                <p className="text-xs text-muted-foreground">
                  Med {num(avanse, 2)} % avanse{faktor !== 1 ? " og prishoppet" : ""} blir det {kr(forslagPris)} kr.{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline underline-offset-2"
                    onClick={() => {
                      setPrisAuto(true);
                      set({ price: prisTekst(forslagPris) });
                    }}
                  >
                    Bruk den
                  </button>
                </p>
              ) : forslagPris !== null ? (
                <p className="text-xs text-muted-foreground">Følger {num(avanse, 2)} % avanse.</p>
              ) : null
            ) : null}
          </div>

          {!pipe && (
            <div className="space-y-1.5">
              <Label htmlFor="vare-beholdning">Beholdning ved oppretting</Label>
              <Input
                id="vare-beholdning"
                className="h-11 tabular"
                inputMode="decimal"
                value={form.stock}
                onChange={(e) => set({ stock: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="vare-varsel">Varselgrense ({form.unit})</Label>
            <Input
              id="vare-varsel"
              className="h-11 tabular"
              inputMode="decimal"
              value={form.low_stock_threshold}
              onChange={(e) => set({ low_stock_threshold: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">0 slår av varselet.</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vare-beskrivelse">Beskrivelse</Label>
            <Textarea
              id="vare-beskrivelse"
              rows={2}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 sm:col-span-2">
            <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} aria-label="Aktiv" />
            <span className="text-sm text-foreground">
              Aktiv
              <span className="text-muted-foreground"> – inaktive varer kan ikke tas ut i appen</span>
            </span>
          </label>
        </div>

        {/* Prisane går gjennom revisjonssporet; lagermannen ser ikkje kostprisen */}
        {pipe && visKostpris ? <Prishistorikk pipeTypeId={pipe.id} /> : null}

        <DialogFooter>
          <Button variant="outline" className="h-12" onClick={onClose}>
            Avbryt
          </Button>
          <Button className="h-12" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Lagre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------ kategoriar

function CategorySection({ categories, pipes }: { categories: PipeCategoryRow[]; pipes: PipeType[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  // Utkast per kategori, slik at ein kan rette fleire felt før det blir lagra
  const [drafts, setDrafts] = useState<Record<string, { name: string; color: string; sort_order: string }>>({});
  const [nyNamn, setNyNamn] = useState("");
  const [nyFarge, setNyFarge] = useState(DEFAULT_COLOR);
  const [toDelete, setToDelete] = useState<PipeCategoryRow | null>(null);

  const draftFor = (c: PipeCategoryRow) =>
    drafts[c.id] ?? { name: c.name, color: c.color || DEFAULT_COLOR, sort_order: String(c.sort_order ?? 0) };

  const setDraft = (id: string, patch: Partial<{ name: string; color: string; sort_order: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { name: "", color: DEFAULT_COLOR, sort_order: "0" }), ...patch } }));

  const done = (title: string) => {
    queryClient.invalidateQueries({ queryKey: QK.categories });
    queryClient.invalidateQueries({ queryKey: QK.types });
    toast({ title });
  };

  const save = useMutation({
    mutationFn: (patch: Partial<PipeCategoryRow> & { id?: string }) => saveCategory(patch),
    onSuccess: (row) => {
      setDrafts((d) => {
        const { [row.id]: _dropped, ...rest } = d;
        return rest;
      });
      setNyNamn("");
      done("Kategorien er lagret");
    },
    onError: (error: Error) => toast({ title: "Kategorien ble ikke lagret", description: error.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      setToDelete(null);
      done("Kategorien er slettet");
    },
    onError: (error: Error) => toast({ title: "Kategorien ble ikke slettet", description: error.message, variant: "destructive" }),
  });

  const antall = (id: string) => pipes.filter((t) => t.category_id === id).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="hm-card">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 p-3 text-left">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-sm font-semibold text-foreground">Kategorier</span>
          <span className="text-xs text-muted-foreground">{categories.length} stk</span>
          <span className="text-xs text-primary">{open ? "Skjul" : "Vis"}</span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Separator />
        <div className="space-y-3 p-3">
          {categories.length === 0 && <p className="text-sm text-muted-foreground">Ingen kategorier ennå.</p>}

          {categories.map((c) => {
            const draft = draftFor(c);
            const endra =
              draft.name !== c.name ||
              draft.color !== (c.color || DEFAULT_COLOR) ||
              draft.sort_order !== String(c.sort_order ?? 0);
            return (
              <div key={c.id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[10rem] flex-1 space-y-1.5">
                  <Label htmlFor={`kat-navn-${c.id}`} className="sr-only">
                    Navn på kategori
                  </Label>
                  <Input
                    id={`kat-navn-${c.id}`}
                    className="h-11"
                    value={draft.name}
                    onChange={(e) => setDraft(c.id, { name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`kat-farge-${c.id}`} className="sr-only">
                    Farge på {c.name}
                  </Label>
                  <input
                    id={`kat-farge-${c.id}`}
                    type="color"
                    className="h-11 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                    value={draft.color}
                    onChange={(e) => setDraft(c.id, { color: e.target.value })}
                  />
                </div>

                <div className="w-20 space-y-1.5">
                  <Label htmlFor={`kat-rekke-${c.id}`} className="sr-only">
                    Rekkefølge for {c.name}
                  </Label>
                  <Input
                    id={`kat-rekke-${c.id}`}
                    className="h-11 tabular"
                    inputMode="numeric"
                    value={draft.sort_order}
                    onChange={(e) => setDraft(c.id, { sort_order: e.target.value })}
                  />
                </div>

                <span className="pb-3 text-xs text-muted-foreground">{antall(c.id)} varer</span>

                <Button
                  variant="outline"
                  className="h-11"
                  disabled={!endra || save.isPending}
                  onClick={() =>
                    save.mutate({
                      id: c.id,
                      name: draft.name.trim(),
                      color: draft.color,
                      sort_order: Math.round(parseNum(draft.sort_order) ?? 0),
                    })
                  }
                >
                  Lagre
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-11 w-11"
                  aria-label={`Slett kategorien ${c.name}`}
                  onClick={() => setToDelete(c)}
                >
                  <Trash2 className="h-4 w-4 text-destructive-ink" aria-hidden="true" />
                </Button>
              </div>
            );
          })}

          <Separator />

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1 space-y-1.5">
              <Label htmlFor="kat-ny-navn">Ny kategori</Label>
              <Input
                id="kat-ny-navn"
                className="h-11"
                placeholder="F.eks. Drensrør"
                value={nyNamn}
                onChange={(e) => setNyNamn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kat-ny-farge" className="sr-only">
                Farge på ny kategori
              </Label>
              <input
                id="kat-ny-farge"
                type="color"
                className="h-11 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                value={nyFarge}
                onChange={(e) => setNyFarge(e.target.value)}
              />
            </div>
            <Button
              className="h-11"
              disabled={!nyNamn.trim() || save.isPending}
              onClick={() =>
                save.mutate({
                  name: nyNamn.trim(),
                  color: nyFarge,
                  sort_order: categories.length,
                })
              }
            >
              <ListPlus className="h-4 w-4" aria-hidden="true" />
              Legg til
            </Button>
          </div>
        </div>
      </CollapsibleContent>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette kategorien {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && antall(toDelete.id) > 0
                ? `${antall(toDelete.id)} varer blir stående uten kategori. Selve varene og lageret blir ikke rørt.`
                : "Kategorien er ikke i bruk, og kan trygt slettes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) remove.mutate(toDelete.id);
              }}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}

// ------------------------------------------------------------ lagerlogg

function StockLogSheet({ target, onClose }: { target: PipeType | "alle" | null; onClose: () => void }) {
  const pipeId = target && target !== "alle" ? target.id : undefined;

  const log = useQuery({
    queryKey: [...QK.stockLog, pipeId ?? "alle"],
    queryFn: () => fetchStockLog({ pipeTypeId: pipeId, limit: 200 }),
    enabled: !!target,
  });

  const tittel = target && target !== "alle" ? pipeLabel(target.name, target.dimension) : "Hele lagerloggen";

  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{tittel}</SheetTitle>
          <SheetDescription>
            {target === "alle" ? "De siste 200 endringene på lageret." : "Alle endringer på denne varen, nyeste først."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {log.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}

          {log.isError && <p className="text-sm text-destructive-ink">{(log.error as Error)?.message}</p>}

          {log.data?.length === 0 && <p className="text-sm text-muted-foreground">Ingen endringer er logget ennå.</p>}

          {(log.data ?? []).map((rad) => (
            <div key={rad.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "tabular font-semibold",
                    rad.change < 0 ? "text-destructive-ink" : "text-success-ink",
                  )}
                >
                  {rad.change > 0 ? "+" : ""}
                  {num(rad.change)}
                </span>
                <span className="flex-1 truncate text-sm text-foreground">{rad.reason}</span>
                <span className="text-xs text-muted-foreground">{dateTime(rad.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {target === "alle" && rad.pipe_name ? `${rad.pipe_name} · ` : ""}
                Ny beholdning: <span className="tabular">{num(rad.balance_after)}</span>
                {/* Kven gjorde det. Tomt for ein kunde utan innlogging, og før 20260928100000 */}
                {rad.created_by_name ? (
                  <>
                    {" · "}
                    <span>av {rad.created_by_name}</span>
                  </>
                ) : null}
              </p>
              {rad.note && <p className="mt-1 text-sm text-muted-foreground">{rad.note}</p>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
