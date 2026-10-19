// Innstillingane for heile systemet: firmainfo på PDF-ane, tekstane kunden
// møter, og kva kundeskjemaet krev. Éi rad i pipe_settings (id = 1).

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink, RefreshCw, Save, Users } from "lucide-react";

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

import { PriceImport } from "@/components/admin/PriceImport";
import { PrisOversikt } from "@/components/admin/PrisOversikt";
import { Prishopp } from "@/components/admin/Prishopp";
import { AVRUNDINGAR_VAL, avrundingTekst, spreiddUtval, type Avrunding } from "@/lib/prisoversikt";
import { useToast } from "@/hooks/use-toast";
import { dateTime, kr, num, parseNum, pipeLabel } from "@/lib/format";
import { QK, applyMarkup, fetchCategories, fetchPipeTypes, previewPrice } from "@/lib/orders";
import { saveSettings, useOfficeSettings } from "@/lib/settings";
import type { PipeSettingsRow } from "@/lib/types";
import { EndringsLogg } from "@/components/admin/EndringsLogg";

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
  /** Verdien i avrundingsvalet: "0.01", "1", "5" eller "10" */
  price_round_to: string;
  price_round_up: boolean;
  /** Standard varselgrense for varer utan eiga, per eining */
  low_stock_default_stk: string;
  low_stock_default_m: string;
  show_prices: boolean;
  require_phone: boolean;
  require_signature: boolean;
  accept_orders: boolean;
  order_email: string;
  payment_terms_days: string;
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
  price_round_to: String(s.price_round_to ?? 1),
  price_round_up: s.price_round_up !== false,
  low_stock_default_stk: String(s.low_stock_default_stk ?? 2).replace(".", ","),
  low_stock_default_m: String(s.low_stock_default_m ?? 10).replace(".", ","),
  show_prices: s.show_prices !== false,
  require_phone: s.require_phone !== false,
  require_signature: s.require_signature === true,
  accept_orders: s.accept_orders === true,
  order_email: s.order_email ?? "",
  payment_terms_days: String(s.payment_terms_days ?? 14),
});

/** Tomme tekstfelt skal bli null i basen, ikkje tomme strengar – då kan resten
 *  av appen halde seg til éin sjekk for "ikkje utfylt". */
const orNull = (v: string) => {
  const t = v.trim();
  return t ? t : null;
};

/** Select-verdiar må vere ikkje-tomme strengar, difor eit eige ord for «alle». */
const SCOPE_ALL = "alle";

const ROUNDING = AVRUNDINGAR_VAL;

const PREVIEW_ROWS = 6;

/** Påslag over dette er nesten alltid ein tastefeil, og databasen avviser det òg. */
const MAX_MARKUP = 1000;

export function SettingsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  // Kontorrada, med påslaget. Den offentlege visninga har det ikkje.
  const query = useOfficeSettings();

  // Heile katalogen, ikkje berre dei aktive: RPC-en rører alt som har
  // innkjøpspris, og då må førehandsvisinga telje det same.
  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<Draft | null>(null);
  const [scope, setScope] = useState<string>(SCOPE_ALL);
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
  // Avrundinga er ei innstilling, ikkje eit val for kvar køyring: nye varer,
  // prishopp og import skal runde likt.
  const roundTo = draft?.price_round_to ?? "1";
  const round = Number(roundTo) || 1;
  const roundUp = draft?.price_round_up ?? true;
  const lagraSteg = Number(base?.price_round_to) || 1;
  const lagraOpp = base?.price_round_up ?? true;
  const lagraAvrunding = useMemo<Avrunding>(() => ({ steg: lagraSteg, opp: lagraOpp }), [lagraSteg, lagraOpp]);
  // Prisoversikta skal vise det som gjeld, ikkje det som står halvskrive i feltet.
  // base blir sett både ved lagring og etter «Oppdater prisene».
  const lagraPaaslag = (base?.markup_percent.trim() ? parseNum(base.markup_percent) : 0) ?? 0;

  const scoped = useMemo(() => {
    const rows = types.data ?? [];
    return scope === SCOPE_ALL ? rows : rows.filter((t) => t.category_id === scope);
  }, [types.data, scope]);

  const priced = useMemo(() => scoped.filter((t) => t.cost_price !== null), [scoped]);
  const missingCost = scoped.length - priced.length;

  /** Utplukk spreidd over prisspennet, ikkje berre dei billigaste. */
  const sample = useMemo(() => spreiddUtval(priced, (t) => t.cost_price ?? 0, PREVIEW_ROWS), [priced]);

  const scopeLabel =
    scope === SCOPE_ALL
      ? "alle varer"
      : (categories.data ?? []).find((c) => c.id === scope)?.name ?? "varegruppen";

  const roundLabel = avrundingTekst({ steg: round, opp: roundUp });

  const apply = useMutation({
    mutationFn: async () => {
      if (markupValue === null || !markupOk) {
        throw new Error(`Påslaget må være et tall mellom 0 og ${MAX_MARKUP}.`);
      }
      // Påslaget blir lagra saman med køyringa, slik at innstillinga og prisane
      // som faktisk ligg ute fortel same historia.
      await saveSettings({ markup_percent: markupValue, price_round_to: round, price_round_up: roundUp });
      return applyMarkup(markupValue, {
        categoryId: scope === SCOPE_ALL ? null : scope,
        roundTo: round,
      });
    },
    onSuccess: (count) => {
      setConfirmOpen(false);
      // Feltet står no likt med basen, så det skal ikkje lenger telje som ulagra.
      setBase((prev) =>
        prev ? { ...prev, markup_percent: markupText, price_round_to: roundTo, price_round_up: roundUp } : prev,
      );
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
      // Number("") er 0, så eit tømt felt ville blitt «0 dager» utan eit ord.
      if (!draft.payment_terms_days.trim()) throw new Error("Betalingsfristen må fylles ut (0–90 dager).");
      const frist = Number(draft.payment_terms_days.trim());
      if (!Number.isInteger(frist) || frist < 0 || frist > 90) {
        throw new Error("Betalingsfristen må være et helt antall dager mellom 0 og 90.");
      }
      const varsel = draft.order_email.trim();
      if (varsel && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(varsel)) {
        throw new Error("E-postadressen for varsler ser ikke riktig ut.");
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
      // Bestillingsfelta blir berre sende når dei er endra. Er appen rulla ut før
      // migrasjonen, finst ikkje kolonnene – og då skal resten av innstillingane
      // framleis kunne lagrast.
      const bestillingEndra =
        !base ||
        draft.accept_orders !== base.accept_orders ||
        draft.order_email !== base.order_email ||
        draft.payment_terms_days !== base.payment_terms_days;
      if (bestillingEndra) {
        patch.accept_orders = draft.accept_orders;
        patch.order_email = orNull(draft.order_email);
        patch.payment_terms_days = frist;
      }
      // Same grunn: avrundingsfelta kom med 20261019110000
      if (!base || draft.price_round_to !== base.price_round_to || draft.price_round_up !== base.price_round_up) {
        patch.price_round_to = Number(draft.price_round_to) || 1;
        patch.price_round_up = draft.price_round_up;
      }
      // Same grunn: standard varselgrense kom med 20261019130000
      if (
        !base ||
        draft.low_stock_default_stk !== base.low_stock_default_stk ||
        draft.low_stock_default_m !== base.low_stock_default_m
      ) {
        const stk = draft.low_stock_default_stk.trim() ? parseNum(draft.low_stock_default_stk) : 0;
        const m = draft.low_stock_default_m.trim() ? parseNum(draft.low_stock_default_m) : 0;
        if (stk === null || stk < 0 || m === null || m < 0) {
          throw new Error("Standard varselgrense må være et tall, 0 eller mer.");
        }
        patch.low_stock_default_stk = stk;
        patch.low_stock_default_m = m;
      }
      await saveSettings(patch);
    },
    onSuccess: () => {
      setBase(draft);
      // Lager-fana les grensa frå kontorinnstillingane
      qc.invalidateQueries({ queryKey: QK.officeSettings });
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

  // Bryteren kan ikkje slåast på før seljaren finst – same regel som
  // pipe_settings_accept_orders_check i basen.
  const mangler = [
    !draft.company_name.trim() && "firmanavn",
    !draft.org_number.trim() && "organisasjonsnummer",
    !draft.address.trim() && "adresse",
    !draft.email.trim() && "e-post",
  ].filter(Boolean) as string[];
  const manglerTekst = mangler.join(", ").replace(/, ([^,]*)$/, " og $1");

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

      <PrisOversikt
        paaslagProsent={lagraPaaslag}
        mvaSats={(base?.vat_rate.trim() ? parseNum(base.vat_rate) : 0) ?? 0}
        ulagraPaaslag={markupOk && markupValue !== lagraPaaslag}
        avrunding={lagraAvrunding}
      />

      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Avanse over Dahl</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prislisten fra Brødrene Dahl er innkjøpspris uten mva. Avansen er det dere legger oppå, og mva kommer i
            tillegg. Nye varer som legges inn med innkjøpspris, får salgsprisen regnet ut med avansen automatisk.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="inn-paaslag">Avanse (%)</Label>
              <Input
                id="inn-paaslag"
                className="h-11 tabular"
                inputMode="decimal"
                placeholder="35"
                value={draft.markup_percent}
                onChange={(e) => set("markup_percent", e.target.value)}
                aria-invalid={markupText.trim() !== "" && !markupOk}
              />
              {markupText.trim() !== "" && !markupOk ? (
                <p className="text-xs text-destructive-ink">
                  Avansen må være et tall mellom 0 og {MAX_MARKUP}.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {markupValue === null
                    ? "Prosent oppå innkjøpsprisen fra Dahl."
                    : `${num(markupValue, 2)} betyr at en vare som koster 100 kr fra Dahl, selges for ${kr(100 + markupValue)} kr eks. mva.`}{" "}
                  Lagres med «Lagre innstillinger» og gjelder nye varer med en gang. Eksisterende varer endres først
                  når du trykker «Oppdater prisene».
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inn-avrunding">Avrunding</Label>
              <Select value={roundTo} onValueChange={(v) => set("price_round_to", v)}>
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
              <div className="flex items-center justify-between gap-3 pt-1">
                <Label htmlFor="inn-avrunding-opp" className="cursor-pointer text-sm">
                  Alltid oppover
                </Label>
                <Switch
                  id="inn-avrunding-opp"
                  checked={roundUp}
                  disabled={round === 0.01}
                  onCheckedChange={(v) => set("price_round_up", v)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {round === 0.01
                  ? "Øre gir nøyaktig avansen, men ikke runde priser."
                  : roundUp
                    ? `Salgsprisen rundes opp til ${roundLabel.replace("opp til ", "")}, så den aldri ligger under avansen.`
                    : "Rundes til nærmeste – noen varer ender litt under avansen."}{" "}
                Gjelder nye varer, prishopp, prisimport og «Oppdater prisene».
              </p>
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
                        // Prishoppet står, så det er med i den nye prisen òg
                        const next = markupOk
                          ? previewPrice(t.cost_price, markupValue, round, t.prishopp_faktor ?? 1, roundUp)
                          : null;
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
              Skriver ny pris på varene med en gang. Avansen blir lagret samtidig.
            </p>
          </div>
        </CardContent>
      </Card>

      <Prishopp paaslagProsent={lagraPaaslag} avrunding={lagraAvrunding} />

      <PriceImport />

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !apply.isPending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oppdatere prisene på {num(priced.length, 0)} varer?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle varer i «{scopeLabel}» som har innkjøpspris får ny pris regnet ut med{" "}
              {num(markupValue ?? 0, 2)} % avanse, avrundet {roundUp && round !== 0.01 ? roundLabel : `til ${roundLabel}`}.
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
          <CardTitle className="text-base">Snart tomt</CardTitle>
          <p className="text-sm text-muted-foreground">
            Standard varselgrense for varer som ikke har sin egen. Når beholdningen er på grensen eller under,
            står varen som «Snart tomt» på Lager. En vare med egen varselgrense bruker sin. 0 slår av standarden.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inn-varsel-stk">Varer i stk</Label>
              <Input
                id="inn-varsel-stk"
                className="h-11 tabular"
                inputMode="decimal"
                value={draft.low_stock_default_stk}
                onChange={(e) => set("low_stock_default_stk", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-varsel-m">Varer i meter</Label>
              <Input
                id="inn-varsel-m"
                className="h-11 tabular"
                inputMode="decimal"
                value={draft.low_stock_default_m}
                onChange={(e) => set("low_stock_default_m", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

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

      <Card className="hm-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bestilling på nett</CardTitle>
          <p className="text-sm text-muted-foreground">
            Butikken på /bestill, der bedrifter og privatpersoner bestiller rør til henting. Hver bestilling må
            godkjennes under Bestillinger før lageret trekkes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <Label htmlFor="inn-accept_orders" className="cursor-pointer text-sm font-semibold">
                Ta imot bestillinger på nett
              </Label>
              <p className="mt-1 max-w-prose pr-12 text-xs text-muted-foreground">
                {mangler.length > 0
                  ? `Fyll ut ${manglerTekst} under Firmaopplysninger${draft.accept_orders ? "" : " først"}. Vilkårene og angreskjemaet kunden får, må si hvem som selger og hvor en angremelding skal sendes.`
                  : "På: /bestill tar imot bestillinger, og hver av dem venter på godkjenning under Bestillinger. Av: /bestill sier «ring oss», og ingen bestilling tas imot. Les vilkårene før du slår på."}
              </p>
            </div>
            <Switch
              id="inn-accept_orders"
              checked={draft.accept_orders}
              disabled={!draft.accept_orders && mangler.length > 0}
              onCheckedChange={(v) => set("accept_orders", v)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inn-ordre-epost">Varsel om nye bestillinger sendes til</Label>
              <Input
                id="inn-ordre-epost"
                className="h-11"
                type="email"
                inputMode="email"
                placeholder={draft.email || "kontor@firma.no"}
                value={draft.order_email}
                onChange={(e) => set("order_email", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tom betyr firmaets e-post. Varselet går for hver bestilling, også dem som skal hentes en annen dag.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inn-frist">Betalingsfrist (dager)</Label>
              <Input
                id="inn-frist"
                className="h-11 tabular"
                inputMode="numeric"
                value={draft.payment_terms_days}
                onChange={(e) => set("payment_terms_days", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Står i vilkårene, i kassen, på PDF-en og i e-postene.</p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm">
            <Link to="/vilkar" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Se vilkårene kunden møter
            </Link>
          </Button>
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

      <EndringsLogg />
    </div>
  );
}
