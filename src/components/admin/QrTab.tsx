// Fana der admin lagar kodane som blir hengde på hyllene. Alt her handlar om
// éin ting: at koden på hylla peikar rett når kunden skannar han.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, FileDown, Info, Loader2, QrCode, Search, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useToast } from "@/hooks/use-toast";
import { num } from "@/lib/format";
import { QK, fetchCategories, fetchPipeTypes } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import { filterAndSortPipes } from "@/lib/stock";
import {
  downloadLabelSheetPDF,
  downloadShelfSignPDF,
  pipeUrl,
  qrDataUrl,
  type LabelPipe,
} from "@/lib/qr-labels";
import { cn } from "@/lib/utils";
import type { PipeType } from "@/lib/types";

/** Kor mange etikettar det går på eit A4-ark – berre til opplysning i grensesnittet. */
const PER_PAGE: Record<2 | 3, number> = { 2: 10, 3: 18 };

const toLabelPipe = (t: PipeType): LabelPipe => ({
  name: t.name,
  dimension: t.dimension,
  sku: t.sku,
  qr_slug: t.qr_slug,
  unit: t.unit,
  price: t.price,
  location: t.location,
  category_name: t.category_name ?? null,
});

/** Nettlesaren blokkerer fleire nedlastingar som kjem i same augeblink. */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ein adresse på denne maskina er verdilaus på ei hylle – då må admin varslast. */
const isLocalAddress = (url: string) => /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([:/]|$)/i.test(url.trim());

export function QrTab() {
  const { toast } = useToast();

  const typesQuery = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const catsQuery = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });
  const { data: settings } = useSettings();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("alle");
  const [onlyActive, setOnlyActive] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [markedId, setMarkedId] = useState<string | null>(null);

  // Kodane blir ofte laga på ein kontor-PC medan appen skal køyre på eit anna
  // domene, difor er adressa eit felt og ikkje ein fast verdi.
  const [baseUrl, setBaseUrl] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [perRow, setPerRow] = useState<2 | 3>(2);
  const [showPrice, setShowPrice] = useState(false);

  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ark" | "skilt" | "alle" | null>(null);

  const urlFieldRef = useRef<HTMLInputElement | null>(null);

  const alle = typesQuery.data ?? [];
  const kategoriar = catsQuery.data ?? [];

  const synlege = useMemo(
    () =>
      filterAndSortPipes(alle, {
        search,
        categoryId: categoryId === "alle" ? null : categoryId,
        onlyActive,
      }),
    [alle, search, categoryId, onlyActive],
  );

  const valgtSett = useMemo(() => new Set(selected), [selected]);
  // Held rekkjefølgja frå lista, slik at etikettarket kjem i same orden som skjermen
  const valgte = useMemo(() => alle.filter((t) => valgtSett.has(t.id)), [alle, valgtSett]);
  const markert = useMemo(() => alle.find((t) => t.id === markedId) ?? null, [alle, markedId]);

  // Markerer den første synlege varen automatisk, elles står førehandsvisinga tom
  // og knappen for hylleskilt ser ut som han ikkje verkar.
  useEffect(() => {
    if (synlege.length === 0) return;
    if (markedId && synlege.some((t) => t.id === markedId)) return;
    setMarkedId(synlege[0].id);
  }, [synlege, markedId]);

  const markertUrl = markert?.qr_slug ? pipeUrl(markert.qr_slug, baseUrl) : "";

  // Førehandsvisinga blir teikna på nytt kvar gong adressa eller varen endrar seg.
  // Flagget hindrar at eit tregt kall skriv over eit nyare.
  useEffect(() => {
    let avbrote = false;
    if (!markertUrl) {
      setPreview(null);
      return;
    }
    qrDataUrl(markertUrl, 360)
      .then((url) => {
        if (!avbrote) setPreview(url);
      })
      .catch(() => {
        if (!avbrote) setPreview(null);
      });
    return () => {
      avbrote = true;
    };
  }, [markertUrl]);

  /* ---------------------------------------------------------------- utval */

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const velgAlleSynlege = () =>
    setSelected((prev) => Array.from(new Set([...prev, ...synlege.map((t) => t.id)])));

  const velgIngen = () => setSelected([]);

  /** Fjernar berre det som står på skjermen, så eit filtrert utval ikkje slettar resten. */
  const fjernSynlege = () => {
    const synlegeIdar = new Set(synlege.map((t) => t.id));
    setSelected((prev) => prev.filter((id) => !synlegeIdar.has(id)));
  };

  const velgKategori = (id: string) => {
    const iKategori = alle.filter((t) => t.category_id === id && (!onlyActive || t.active)).map((t) => t.id);
    if (iKategori.length === 0) {
      toast({ title: "Ingen varer i kategorien", description: "Kategorien er tom, eller alle varene er avslått." });
      return;
    }
    setSelected((prev) => Array.from(new Set([...prev, ...iKategori])));
    toast({ title: "Kategori lagt til", description: `${num(iKategori.length)} varer er nå valgt i tillegg.` });
  };

  const alleSynlegeValde = synlege.length > 0 && synlege.every((t) => valgtSett.has(t.id));

  /* ------------------------------------------------------------ kopiering */

  /** Siste utveg: legg teksten i eit felt, marker han og la nettlesaren kopiere. */
  const kopierViaMarkering = (url: string): boolean => {
    try {
      const felt = document.createElement("textarea");
      felt.value = url;
      felt.setAttribute("readonly", "true");
      felt.style.position = "fixed";
      felt.style.top = "0";
      felt.style.opacity = "0";
      document.body.appendChild(felt);
      felt.select();
      felt.setSelectionRange(0, url.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(felt);
      return ok;
    } catch {
      return false;
    }
  };

  const kopierLenke = async (pipe: PipeType) => {
    if (!pipe.qr_slug) {
      toast({ variant: "destructive", title: "Varen mangler QR-kode", description: "Legg inn en kode på varen først." });
      return;
    }
    const url = pipeUrl(pipe.qr_slug, baseUrl);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("mangler utklippstavle");
      await navigator.clipboard.writeText(url);
      toast({ title: "Lenken er kopiert", description: url });
      return;
    } catch {
      if (kopierViaMarkering(url)) {
        toast({ title: "Lenken er kopiert", description: url });
        return;
      }
      // Klarer vi ikkje kopiere, markerer vi teksten i feltet så han kan takast manuelt
      setMarkedId(pipe.id);
      setTimeout(() => {
        urlFieldRef.current?.focus();
        urlFieldRef.current?.select();
      }, 0);
      toast({
        variant: "destructive",
        title: "Kunne ikke kopiere automatisk",
        description: "Adressen er markert i feltet under forhåndsvisningen – trykk Ctrl+C.",
      });
    }
  };

  /* ------------------------------------------------------------ utskrifter */

  const feilmelding = (e: unknown) => (e instanceof Error && e.message ? e.message : "Ukjent feil");

  const lastNedArk = async () => {
    if (valgte.length === 0) {
      toast({ variant: "destructive", title: "Ingen varer er valgt", description: "Kryss av for varene du vil ha etiketter til." });
      return;
    }
    setBusy("ark");
    try {
      await downloadLabelSheetPDF(valgte.map(toLabelPipe), {
        perRow,
        showPrice,
        baseUrl,
        companyName: settings?.company_name ?? undefined,
      });
      toast({ title: "Etikettarket er lastet ned", description: `${num(valgte.length)} etiketter.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Klarte ikke å lage etikettarket", description: feilmelding(e) });
    } finally {
      setBusy(null);
    }
  };

  const lastNedSkilt = async () => {
    if (!markert) {
      toast({ variant: "destructive", title: "Ingen vare er markert", description: "Klikk på en vare i listen først." });
      return;
    }
    setBusy("skilt");
    try {
      await downloadShelfSignPDF(toLabelPipe(markert), {
        showPrice,
        baseUrl,
        companyName: settings?.company_name ?? undefined,
      });
      toast({ title: "Hylleskiltet er lastet ned", description: markert.name });
    } catch (e) {
      toast({ variant: "destructive", title: "Klarte ikke å lage hylleskiltet", description: feilmelding(e) });
    } finally {
      setBusy(null);
    }
  };

  // Hylleskiltet er eitt ark per vare og kan ikkje slåast saman til eitt dokument,
  // så fleire valde varer blir like mange nedlastingar – med pause mellom, elles
  // stoppar nettlesaren alt etter den første.
  const lastNedAlleSkilt = async () => {
    if (valgte.length === 0) return;
    setBusy("alle");
    let feila = 0;
    try {
      for (const pipe of valgte) {
        try {
          await downloadShelfSignPDF(toLabelPipe(pipe), {
            showPrice,
            baseUrl,
            companyName: settings?.company_name ?? undefined,
          });
        } catch {
          feila += 1;
        }
        await pause(350);
      }
      if (feila > 0) {
        toast({
          variant: "destructive",
          title: "Noen hylleskilt feilet",
          description: `${num(valgte.length - feila)} av ${num(valgte.length)} ble lastet ned.`,
        });
      } else {
        toast({ title: "Hylleskiltene er lastet ned", description: `${num(valgte.length)} filer, én per vare.` });
      }
    } finally {
      setBusy(null);
    }
  };

  const ark = Math.ceil(valgte.length / PER_PAGE[perRow]) || 0;
  const lokalAdresse = isLocalAddress(baseUrl);
  const utenSlug = valgte.filter((t) => !t.qr_slug).length;

  /* ------------------------------------------------------------------ ui */

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="hm-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <QrCode className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">QR-koder til hyllene</h2>
            <p className="text-sm text-muted-foreground">
              Velg varene du vil lage koder til, skriv ut etikettark eller hylleskilt, laminer arket og heng det på
              hyllen. Kunden skanner koden med kameraet på telefonen og kommer rett til riktig rørtype.
            </p>
            <p className="text-sm text-muted-foreground">
              Kontroller adressen under forhåndsvisningen før du skriver ut. En kode som peker på feil adresse er
              ubrukelig når den først henger på hyllen.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* -------------------------------------------------- liste og utval */}
        <div className="hm-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="qr-sok">Søk etter vare</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="qr-sok"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Navn, dimensjon, varenummer eller hylle"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:w-56">
              <Label htmlFor="qr-kategori">Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="qr-kategori">
                  <SelectValue placeholder="Alle kategorier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle kategorier</SelectItem>
                  {kategoriar.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={velgAlleSynlege} disabled={synlege.length === 0}>
              Velg alle
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={velgIngen} disabled={selected.length === 0}>
              Velg ingen
            </Button>

            <Select value="" onValueChange={velgKategori}>
              <SelectTrigger className="h-9 w-auto min-w-[11rem] text-sm" aria-label="Velg alle varer i en kategori">
                <SelectValue placeholder="Velg kategori" />
              </SelectTrigger>
              <SelectContent>
                {kategoriar.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Switch id="qr-aktive" checked={onlyActive} onCheckedChange={setOnlyActive} />
              <Label htmlFor="qr-aktive" className="text-sm font-normal text-muted-foreground">
                Bare aktive varer
              </Label>
            </div>
          </div>

          <div className="text-sm text-muted-foreground tabular">
            {num(selected.length)} av {num(alle.length)} varer valgt
            {synlege.length !== alle.length ? ` · ${num(synlege.length)} vises nå` : ""}
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={alleSynlegeValde}
                      onCheckedChange={(v) => (v ? velgAlleSynlege() : fjernSynlege())}
                      aria-label="Velg alle varene som vises"
                      disabled={synlege.length === 0}
                    />
                  </TableHead>
                  <TableHead>Vare</TableHead>
                  <TableHead className="hidden md:table-cell">Varenr.</TableHead>
                  <TableHead className="hidden md:table-cell">Hylle</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead className="w-12 text-right">Lenke</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typesQuery.isLoading &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <TableRow key={`skjelett-${i}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}

                {typesQuery.isError && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-destructive">
                      Klarte ikke å hente rørtypene. Last siden på nytt.
                    </TableCell>
                  </TableRow>
                )}

                {!typesQuery.isLoading && !typesQuery.isError && synlege.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Ingen varer passer med søket.
                    </TableCell>
                  </TableRow>
                )}

                {synlege.map((t) => (
                  <TableRow
                    key={t.id}
                    onClick={() => setMarkedId(t.id)}
                    className={cn("cursor-pointer", markedId === t.id && "bg-primary/5 hover:bg-primary/5")}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={valgtSett.has(t.id)}
                        onCheckedChange={() => toggle(t.id)}
                        aria-label={`Velg ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {t.name}
                        {t.dimension ? <span className="text-muted-foreground"> {t.dimension}</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.category_name ?? "Uten kategori"}
                        {!t.active ? " · avslått" : ""}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular">
                      {t.sku || "–"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {t.location || "–"}
                    </TableCell>
                    <TableCell>
                      {t.qr_slug ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.qr_slug}</code>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Mangler
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Kopier lenke til ${t.name}`}
                        title="Kopier lenke"
                        onClick={() => kopierLenke(t)}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ------------------------------------------ førehandsvising og utskrift */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="hm-card p-4 sm:p-5 space-y-4">
            <h3 className="font-semibold">Forhåndsvisning</h3>

            <div className="flex flex-col items-center gap-2">
              <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-border bg-white p-2">
                {preview ? (
                  <img
                    src={preview}
                    alt={markert ? `QR-kode for ${markert.name}` : "QR-kode"}
                    className="h-full w-full object-contain animate-scale-in"
                  />
                ) : (
                  <span className="px-3 text-center text-xs text-muted-foreground">
                    {markert ? "Lager kode …" : "Klikk på en vare i listen"}
                  </span>
                )}
              </div>
              {markert && (
                <div className="text-center">
                  <div className="font-medium">
                    {markert.name}
                    {markert.dimension ? <span className="text-muted-foreground"> {markert.dimension}</span> : null}
                  </div>
                  {markert.location && <div className="text-xs text-muted-foreground">Hylle {markert.location}</div>}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qr-url">Adressen koden peker på</Label>
              <Input
                id="qr-url"
                ref={urlFieldRef}
                readOnly
                value={markertUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qr-base">Adresse appen ligger på</Label>
              <Input
                id="qr-base"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://rorlager.no"
                inputMode="url"
              />
              {lokalAdresse ? (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Adressen peker på denne maskinen. Skriv inn den ekte nettadressen før du skriver ut, ellers virker
                  ikke kodene på hyllen.
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Brukes i alle kodene du laster ned nå.
                </p>
              )}
            </div>
          </div>

          <div className="hm-card p-4 sm:p-5 space-y-4">
            <h3 className="font-semibold">Skriv ut</h3>

            <div className="space-y-1.5">
              <Label htmlFor="qr-perrad">Etiketter per rad</Label>
              <Select value={String(perRow)} onValueChange={(v) => setPerRow(Number(v) === 3 ? 3 : 2)}>
                <SelectTrigger id="qr-perrad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 per rad – store etiketter</SelectItem>
                  <SelectItem value="3">3 per rad – flere på arket</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="qr-pris" className="font-normal">
                Vis pris på etikettene
              </Label>
              <Switch id="qr-pris" checked={showPrice} onCheckedChange={setShowPrice} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Button type="button" className="w-full" onClick={lastNedArk} disabled={busy !== null || valgte.length === 0}>
                {busy === "ark" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Last ned etikettark (PDF)
              </Button>
              <p className="text-xs text-muted-foreground tabular">
                {valgte.length === 0
                  ? "Velg minst én vare i listen."
                  : `${num(valgte.length)} etiketter · ${num(ark)} ark A4`}
              </p>
              {utenSlug > 0 && (
                <p className="text-xs text-destructive">
                  {num(utenSlug)} av de valgte varene mangler QR-kode og får tom rute på arket.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={lastNedSkilt}
                disabled={busy !== null || !markert}
              >
                {busy === "skilt" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Last ned hylleskilt
              </Button>
              <p className="text-xs text-muted-foreground">
                {markert
                  ? `A5 liggende med stor kode for ${markert.name}${markert.dimension ? ` ${markert.dimension}` : ""}.`
                  : "Marker en vare i listen først."}
              </p>

              {valgte.length > 1 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={lastNedAlleSkilt}
                    disabled={busy !== null}
                  >
                    {busy === "alle" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Hylleskilt for alle valgte
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Hvert hylleskilt er sin egen fil. Du får {num(valgte.length)} nedlastinger etter hverandre, og
                    nettleseren kan spørre om lov til å laste ned flere filer.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
