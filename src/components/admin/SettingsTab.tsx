// Innstillingane for heile systemet: firmainfo på PDF-ane, tekstane kunden
// møter, og kva kundeskjemaet krev. Éi rad i pipe_settings (id = 1).

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Users } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/hooks/use-toast";
import { dateTime, kr, num, parseNum, pipeLabel } from "@/lib/format";
import { QK, applyMarkup, fetchCategories, fetchPipeTypes, previewPrice } from "@/lib/orders";
import { saveSettings, useSettings } from "@/lib/settings";
import type { PipeSettingsRow, PipeType } from "@/lib/types";

/** Skjemaet held alt som tekst, slik at eit halvskrive tal ikkje blir tolka
 *  som 0 medan brukaren framleis skriv. */
type Draft = {
  company_name: string;
  org_number: string;
  address: string;
  phone: string;
  email: string;
  intro_text: string;
  pickup_note: string;
  vat_rate: string;
  markup_percent: string;
  show_prices: boolean;
  require_phone: boolean;
  require_signature: boolean;
};

const toDraft = (s: PipeSettingsRow): Draft => ({
  company_name: s.company_name ?? "",
  org_number: s.org_number ?? "",
  address: s.address ?? "",
  phone: s.phone ?? "",
  email: s.email ?? "",
  intro_text: s.intro_text ?? "",
  pickup_note: s.pickup_note ?? "",
  vat_rate: s.vat_rate === null || s.vat_rate === undefined ? "" : String(s.vat_rate).replace(".", ","),
  markup_percent:
    s.markup_percent === null || s.markup_percent === undefined
      ? ""
      : String(s.markup_percent).replace(".", ","),
  show_prices: s.show_prices !== false,
  require_phone: s.require_phone !== false,
  require_signature: s.require_signature === true,
});

/** Tomme tekstfelt skal bli null i basen, ikkje tomme strengar – då kan resten
 *  av appen halde seg til éin sjekk for "ikkje utfylt". */
const orNull = (v: string) => {
  const t = v.trim();
  return t ? t : null;
};

/** Select-verdiar må vere ikkje-tomme strengar, difor eit eige ord for «alle». */
const SCOPE_ALL = "alle";

const ROUNDING = [
  { value: "1", label: "Nærmeste krone" },
  { value: "5", label: "Nærmeste 5 kroner" },
  { value: "10", label: "Nærmeste 10 kroner" },
  { value: "0.01", label: "Øre" },
] as const;

const PREVIEW_ROWS = 6;

/** Påslag over dette er nesten alltid ein tastefeil, og databasen avviser det òg. */
const MAX_MARKUP = 1000;

export function SettingsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const query = useSettings();

  // Heile katalogen, ikkje berre dei aktive: RPC-en rører alt som har
  // innkjøpspris, og då må førehandsvisinga telje det same.
  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<Draft | null>(null);
  const [scope, setScope] = useState<string>(SCOPE_ALL);
  const [roundTo, setRoundTo] = useState<string>("1");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Ei bakgrunnsoppfrisking skal ikkje overskrive det brukaren held på å skrive,
  // så vi tek berre imot rader vi ikkje har teke imot før.
  const syncedAt = useRef<string | null>(null);

  useEffect(() => {
    if (query.isPlaceholderData || !query.data) return;
    if (syncedAt.current === query.data.updated_at) return;
    syncedAt.current = query.data.updated_at;
    const next = toDraft(query.data);
    setBase(next);
    setDraft(next);
  }, [query.data, query.isPlaceholderData]);

  const dirty = Boolean(draft && base) && JSON.stringify(draft) !== JSON.stringify(base);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? ({ ...prev, [key]: value } as Draft) : prev));

  // ------------------------------------------------------------ prisjustering

  const markupText = draft?.markup_percent ?? "";
  const markupValue = markupText.trim() ? parseNum(markupText) : null;
  const markupOk = markupValue !== null && markupValue >= 0 && markupValue <= MAX_MARKUP;
  const round = Number(roundTo) || 1;

  const scoped = useMemo(() => {
    const rows = types.data ?? [];
    return scope === SCOPE_ALL ? rows : rows.filter((t) => t.category_id === scope);
  }, [types.data, scope]);

  const priced = useMemo(() => scoped.filter((t) => t.cost_price !== null), [scoped]);
  const missingCost = scoped.length - priced.length;

  /** Utplukk spreidd over prisspennet. Dei første radene i katalogen høyrer alle
   *  til same varegruppe, og ville ikkje vist kva påslaget gjer med dei dyre. */
  const sample = useMemo(() => {
    if (priced.length === 0) return [] as PipeType[];
    const sorted = [...priced].sort((a, b) => (a.cost_price ?? 0) - (b.cost_price ?? 0));
    const wanted = Math.min(PREVIEW_ROWS, sorted.length);
    const picked = new Set<number>();
    const out: PipeType[] = [];
    for (let i = 0; i < wanted; i++) {
      const idx = Math.round((i * (sorted.length - 1)) / Math.max(1, wanted - 1));
      if (picked.has(idx)) continue;
      picked.add(idx);
      out.push(sorted[idx]);
    }
    return out;
  }, [priced]);

  const scopeLabel =
    scope === SCOPE_ALL
      ? "alle varer"
      : (categories.data ?? []).find((c) => c.id === scope)?.name ?? "varegruppen";

  const roundLabel = (ROUNDING.find((r) => r.value === roundTo)?.label ?? "nærmeste krone").toLowerCase();

  const apply = useMutation({
    mutationFn: async () => {
      if (markupValue === null || !markupOk) {
        throw new Error(`Påslaget må være et tall mellom 0 og ${MAX_MARKUP}.`);
      }
      // Påslaget blir lagra saman med køyringa, slik at innstillinga og prisane
      // som faktisk ligg ute fortel same historia.
      await saveSettings({ markup_percent: markupValue });
      return applyMarkup(markupValue, {
        categoryId: scope === SCOPE_ALL ? null : scope,
        roundTo: round,
      });
    },
    onSuccess: (count) => {
      setConfirmOpen(false);
      // Feltet står no likt med basen, så det skal ikkje lenger telje som ulagra.
      setBase((prev) => (prev ? { ...prev, markup_percent: markupText } : prev));
      toast({
        title: `${num(count ?? 0, 0)} varer fikk ny pris`,
        description: "Bestillinger som alt er sendt inn beholder prisene sine.",
      });
      qc.invalidateQueries({ queryKey: QK.types });
    },
    onError: (e: unknown) =>
      toast({
        title: "Klarte ikke å oppdatere prisene",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      }),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const name = draft.company_name.trim();
      if (!name) throw new Error("Firmanavn må fylles ut – det står øverst på alle PDF-er.");

      const vat = draft.vat_rate.trim() ? parseNum(draft.vat_rate) : 0;
      if (vat === null || vat < 0 || vat > 100) {
        throw new Error("Mva-satsen må være et tall mellom 0 og 100.");
      }

      const markup = draft.markup_percent.trim() ? parseNum(draft.markup_percent) : 0;
      if (markup === null || markup < 0 || markup > MAX_MARKUP) {
        throw new Error(`Påslaget må være et tall mellom 0 og ${MAX_MARKUP}.`);
      }

      const patch: Partial<PipeSettingsRow> = {
        company_name: name,
        org_number: orNull(draft.org_number),
        address: orNull(draft.address),
        phone: orNull(draft.phone),
        email: orNull(draft.email),
        intro_text: orNull(draft.intro_text),
        pickup_note: orNull(draft.pickup_note),
        vat_rate: vat,
        markup_percent: markup,
        show_prices: draft.show_prices,
        require_phone: draft.require_phone,
        require_signature: draft.require_signature,
        updated_at: new Date().toISOString(),
      };
      await saveSettings(patch);
    },
    onSuccess: () => {
      setBase(draft);
      toast({ title: "Innstillingene er lagret", description: "Endringene gjelder med en gang." });
      qc.invalidateQueries({ queryKey: QK.settings });
    },
    onError: (e: unknown) =>
      toast({
        title: "Klarte ikke å lagre",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      }),
  });

  if (!draft) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const toggles: {
    id: "show_prices" | "require_phone" | "require_signature";
    label: string;
    hint: string;
    value: boolean;
  }[] = [
    {
      id: "show_prices",
      label: "Vis priser for kunden",
      hint:
        "På: kunden ser pris per enhet på varesiden, sum i handlekurven og beløp på kvitteringen. Av: kunden ser bare mengde, og prisen avtales i etterkant. Prisene ligger uansett lagret, så fakturagrunnlaget blir det samme.",
      value: draft.show_prices,
    },
    {
      id: "require_phone",
      label: "Krev telefonnummer",
      hint:
        "På: kunden må fylle ut telefonnummer før uttaket kan sendes inn. Slå av hvis navn er nok – men da har dere ingen måte å ta kontakt på hvis noe er uklart i bestillingen.",
      value: draft.require_phone,
    },
    {
      id: "require_signature",
      label: "Krev signatur",
      hint:
        "På: kunden må signere med fingeren på skjermen før uttaket sendes. Signaturen blir med på fakturagrunnlaget som dokumentasjon på at rørene faktisk ble hentet. Av: uttaket sendes med ett trykk mindre.",
      value: draft.require_signature,
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Firmaopplysninger</CardTitle>
          <p className="text-sm text-muted-foreground">
            Står øverst på kvitteringer, plukklister og fakturagrunnlag.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inn-firma">Firmanavn</Label>
              <Input
                id="inn-firma"
                className="h-11"
                value={draft.company_name}
                onChange={(e) => set("company_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-orgnr">Organisasjonsnummer</Label>
              <Input
                id="inn-orgnr"
                className="h-11"
                inputMode="numeric"
                placeholder="999 999 999"
                value={draft.org_number}
                onChange={(e) => set("org_number", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inn-adresse">Adresse</Label>
              <Input
                id="inn-adresse"
                className="h-11"
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-telefon">Telefon</Label>
              <Input
                id="inn-telefon"
                className="h-11"
                type="tel"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-epost">E-post</Label>
              <Input
                id="inn-epost"
                className="h-11"
                type="email"
                inputMode="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-mva">Mva-sats (%)</Label>
              <Input
                id="inn-mva"
                className="h-11 tabular"
                inputMode="decimal"
                placeholder="25"
                value={draft.vat_rate}
                onChange={(e) => set("vat_rate", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Prisene på rørene er uten mva. Satsen vises på fakturagrunnlaget under Faktura, som en egen
                blokk under summen med grunnlag eks. mva, mva-beløp og sum inkl. mva – men bare når «Vis priser
                og sum» er huket av på PDF-en. Står satsen til 0, blir blokken utelatt.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prisjustering</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prislisten fra Brødrene Dahl er innkjøpspris uten mva. Påslaget er det dere legger oppå, og
            salgsprisen blir regnet ut og lagret på hver enkelt vare.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="inn-paaslag">Påslag (%)</Label>
              <Input
                id="inn-paaslag"
                className="h-11 tabular"
                inputMode="decimal"
                placeholder="25"
                value={draft.markup_percent}
                onChange={(e) => set("markup_percent", e.target.value)}
                aria-invalid={markupText.trim() !== "" && !markupOk}
              />
              {markupText.trim() !== "" && !markupOk ? (
                <p className="text-xs text-destructive">
                  Påslaget må være et tall mellom 0 og {MAX_MARKUP}.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  25 betyr at en vare som koster 100 kroner inn, får 125 kroner i salgspris.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inn-avrunding">Avrunding</Label>
              <Select value={roundTo} onValueChange={setRoundTo}>
                <SelectTrigger id="inn-avrunding" className="h-11">
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
              <p className="text-xs text-muted-foreground">Hele kroner er lettest å lese på hylleskiltet.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inn-utvalg">Hva skal justeres</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="inn-utvalg" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SCOPE_ALL}>Alle varer</SelectItem>
                  {(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {types.isLoading ? "Teller opp varene …" : `${num(scoped.length, 0)} varer i utvalget.`}
              </p>
            </div>
          </div>

          {/* ------------------------------------------------ førehandsvising */}
          {types.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : scoped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen varer i dette utvalget. Velg en annen varegruppe.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-semibold text-foreground">
                  {num(priced.length, 0)} varer får ny pris
                </span>
                {missingCost > 0 && (
                  <span className="text-muted-foreground">
                    {" – "}
                    {num(missingCost, 0)} varer har ikke innkjøpspris og blir ikke rørt
                  </span>
                )}
              </p>

              {sample.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table className="min-w-[36rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vare</TableHead>
                        <TableHead className="text-right">Innkjøp</TableHead>
                        <TableHead className="text-right">Pris i dag</TableHead>
                        <TableHead className="text-right">Ny pris</TableHead>
                        <TableHead className="text-right">Endring</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sample.map((t) => {
                        // Tomt eller ugyldig felt skal vise dagens pris om att,
                        // ikkje sprenge tabellen medan brukaren skriv.
                        const next = markupOk ? previewPrice(t.cost_price, markupValue, round) : null;
                        const diff = next === null || t.price === null ? null : next - t.price;
                        const pct = diff !== null && t.price ? (diff / t.price) * 100 : null;
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">
                              {pipeLabel(t.name, t.dimension)}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm text-muted-foreground">
                              {kr(t.cost_price)}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm text-muted-foreground">
                              {kr(t.price)}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm font-semibold">
                              {next === null ? "–" : kr(next)}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm text-muted-foreground">
                              {diff === null
                                ? t.price === null
                                  ? "Ny"
                                  : "–"
                                : `${diff > 0 ? "+" : ""}${kr(diff)}${
                                    pct === null ? "" : ` (${pct > 0 ? "+" : ""}${num(pct, 1)} %)`
                                  }`}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Et utvalg spredt over prisspennet, ikke bare de billigste. Tabellen oppdateres mens du skriver.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setConfirmOpen(true)}
              disabled={!markupOk || priced.length === 0 || types.isLoading || apply.isPending}
            >
              {apply.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Oppdater prisene
            </Button>
            <p className="text-xs text-muted-foreground">
              Skriver ny pris på varene med en gang. Påslaget blir lagret samtidig.
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !apply.isPending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oppdatere prisene på {num(priced.length, 0)} varer?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle varer i «{scopeLabel}» som har innkjøpspris får ny pris regnet ut med{" "}
              {num(markupValue ?? 0, 2)} % påslag, avrundet til {roundLabel}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {missingCost > 0 && (
              <li>
                {num(missingCost, 0)} varer i utvalget mangler innkjøpspris og står urørt med prisen de har i
                dag.
              </li>
            )}
            <li>
              Bestillinger som alt er sendt inn endres ikke. Hver ordrelinje har sin egen pris fra dagen
              bestillingen kom inn, og den skal stå slik den var.
            </li>
            <li>
              Dette kan ikke angres med en knapp – men du kan kjøre det på nytt med et annet påslag når som
              helst.
            </li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apply.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Dialogen skal stå til RPC-en har svart, elles rekk ikkje
                // brukaren å sjå at noko går gale.
                e.preventDefault();
                apply.mutate();
              }}
              disabled={apply.isPending}
            >
              {apply.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Oppdater prisene
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tekster kunden ser</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inn-intro">Introtekst på forsiden</Label>
            <Textarea
              id="inn-intro"
              rows={3}
              value={draft.intro_text}
              onChange={(e) => set("intro_text", e.target.value)}
              placeholder="Skann QR-koden på hylla for å registrere hva du tar med deg."
            />
            <p className="text-xs text-muted-foreground">
              Det første kunden leser når han åpner appen. Hold den kort – folk står i lageret.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inn-hentemelding">Hentemelding på kvitteringen</Label>
            <Textarea
              id="inn-hentemelding"
              rows={3}
              value={draft.pickup_note}
              onChange={(e) => set("pickup_note", e.target.value)}
              placeholder="Ta med rørene og lukk porten etter deg. Vi tar kontakt hvis noe er uklart."
            />
            <p className="text-xs text-muted-foreground">
              Vises nederst på kvitteringen etter at uttaket er sendt inn.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hva kundeskjemaet krever</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {toggles.map((t) => (
            <div key={t.id} className="border-b border-border py-3 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <Label htmlFor={`inn-${t.id}`} className="cursor-pointer text-sm font-semibold">
                  {t.label}
                </Label>
                <Switch
                  id={`inn-${t.id}`}
                  checked={t.value}
                  onCheckedChange={(v) => set(t.id, v)}
                />
              </div>
              <p className="mt-1 max-w-prose pr-12 text-xs text-muted-foreground">{t.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sticky slik at knappen er innan rekkjevidde uansett kor langt ned ein har skrolla */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        <Button className="h-11" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Lagre innstillinger
        </Button>
        {dirty && (
          <Button variant="ghost" className="h-11" onClick={() => setDraft(base)} disabled={save.isPending}>
            Forkast endringer
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {dirty
            ? "Du har endringer som ikke er lagret."
            : query.data?.updated_at
              ? `Sist lagret ${dateTime(query.data.updated_at)}`
              : "Alt er lagret."}
        </p>
      </div>

      <Card className="hm-card border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground">Om systemet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Kunden skanner QR-koden som henger på hylla, får opp rørtypen, taster antall meter og legger det i
            handlekurven. Når han er ferdig sender han inn uttaket med navn og telefon. Bestillingen dukker opp
            under Bestillinger, og lagerbeholdningen trekkes ned automatisk med en gang uttaket er sendt.
          </p>
          <p>
            Under Lager styrer du rørtyper, priser og beholdning. Under QR skriver du ut etiketter og hylleskilt.
            Under Faktura samler du ufakturerte uttak per kunde til et PDF-grunnlag.
          </p>
          <div className="pt-1">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/brukere">
                <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                Brukere som har tilgang
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
