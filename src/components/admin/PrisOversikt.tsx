// Oversikt over korleis prisane på rørene faktisk står: innkjøp, tillegg i
// kroner og prosent, salspris med og utan mva, og kva varer som ikkje fylgjer
// standardpåslaget. Les berre – endringar skjer i Prisjustering og under Lager.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { kr, num, pipeLabel } from "@/lib/format";
import { prisInklMva } from "@/lib/mva";
import { QK, fetchCategories, fetchPipeTypes, previewPrice } from "@/lib/orders";
import {
  PRIS_STATUS_LABEL,
  dekningsgradAv,
  prislinje,
  prisoppsummering,
  type PrisStatus,
  type Prislinje,
} from "@/lib/prisoversikt";

const ALLE = "alle";
const FORSTE_RADER = 60;

type Sortering = "katalog" | "paaslagLav" | "paaslagHoy" | "utsalgHoy";

const SORTERINGAR: { value: Sortering; label: string }[] = [
  { value: "katalog", label: "Som i katalogen" },
  { value: "paaslagLav", label: "Lavest påslag først" },
  { value: "paaslagHoy", label: "Høyest påslag først" },
  { value: "utsalgHoy", label: "Dyreste først" },
];

const STATUS_FARGE: Record<PrisStatus, string> = {
  standard: "text-success-ink",
  avvik: "text-warning-ink",
  utenInnkjop: "text-destructive-ink",
  utenPris: "text-destructive-ink",
};

const prosent = (v: number | null, des = 1) => (v === null ? "–" : `${num(v, des)} %`);

function sorter(linjer: Prislinje[], s: Sortering): Prislinje[] {
  if (s === "katalog") return linjer;
  // Varer utan tal skal liggje sist uansett retning, ikkje først som «0».
  const verdi = (l: Prislinje) => (s === "utsalgHoy" ? l.utsalg : l.paaslag);
  const retning = s === "paaslagLav" ? 1 : -1;
  return [...linjer].sort((a, b) => {
    const va = verdi(a);
    const vb = verdi(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * retning;
  });
}

type Props = {
  /** Det lagra påslaget, ikkje det som står i feltet og kanskje ikkje er lagra */
  paaslagProsent: number;
  mvaSats: number;
  /** Feltet under har eit anna påslag enn det som er lagra */
  ulagraPaaslag?: boolean;
};

export function PrisOversikt({ paaslagProsent, mvaSats, ulagraPaaslag }: Props) {
  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });

  const [sok, setSok] = useState("");
  const [gruppe, setGruppe] = useState(ALLE);
  const [status, setStatus] = useState<PrisStatus | typeof ALLE>(ALLE);
  const [sortering, setSortering] = useState<Sortering>("katalog");
  const [visAlle, setVisAlle] = useState(false);

  const alle = useMemo(
    () => (types.data ?? []).map((t) => prislinje(t, paaslagProsent, mvaSats)),
    [types.data, paaslagProsent, mvaSats],
  );

  // Oppsummeringa gjeld varegruppa, men ikkje søket eller statusfilteret –
  // elles ville tala i rutene endre seg når ein trykkjer på dei.
  const iGruppa = useMemo(
    () => (gruppe === ALLE ? alle : alle.filter((l) => l.vare.category_id === gruppe)),
    [alle, gruppe],
  );
  const sum = useMemo(() => prisoppsummering(iGruppa), [iGruppa]);

  const viste = useMemo(() => {
    const q = sok.trim().toLowerCase();
    const filtrert = iGruppa.filter((l) => {
      if (status !== ALLE && l.status !== status) return false;
      if (!q) return true;
      const t = l.vare;
      return [t.name, t.dimension, t.sku, t.category_name].some((f) => f?.toLowerCase().includes(q));
    });
    return sorter(filtrert, sortering);
  }, [iGruppa, sok, status, sortering]);

  const rader = visAlle ? viste : viste.slice(0, FORSTE_RADER);

  // Regneeksempelet på 100 kroner, med same formel og avrunding som databasen
  const eksInnkjop = 100;
  const eksUtsalg = previewPrice(eksInnkjop, paaslagProsent, 1) ?? eksInnkjop;
  const eksInkl = prisInklMva(eksUtsalg, mvaSats);
  const dg = dekningsgradAv(paaslagProsent);

  const ruter: { key: PrisStatus | typeof ALLE; tittel: string; verdi: string; under: string }[] = [
    {
      key: "standard",
      tittel: "Følger standard",
      verdi: `${num(sum.perStatus.standard, 0)} av ${num(sum.antall, 0)}`,
      under: `Salgspris = innkjøp + ${num(paaslagProsent, 2)} %`,
    },
    {
      key: "avvik",
      tittel: "Avviker",
      verdi: num(sum.perStatus.avvik, 0),
      under: "Pris satt for hånd eller med annet påslag",
    },
    {
      key: "utenInnkjop",
      tittel: "Mangler innkjøpspris",
      verdi: num(sum.perStatus.utenInnkjop, 0),
      under: "Påslaget kan ikke regnes ut",
    },
    {
      key: "utenPris",
      tittel: "Mangler salgspris",
      verdi: num(sum.perStatus.utenPris, 0),
      under: "Kunden ser ingen pris",
    },
  ];

  return (
    <Card className="hm-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prisoversikt</CardTitle>
        <p className="text-sm text-muted-foreground">
          Slik er prisene på rørene satt opp akkurat nå. Tallene hentes rett fra varene, så salgsprisen du ser
          her er den kunden blir belastet.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ------------------------------------------------ regnestykket */}
        <div>
          <p className="mb-2 text-sm font-semibold">Slik regnes prisen</p>
          <ol className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
            {[
              {
                tittel: "Innkjøpspris",
                tekst: "Fra prislisten til Brødrene Dahl, eks. mva",
                eks: kr(eksInnkjop),
              },
              {
                tittel: `+ Påslag ${num(paaslagProsent, 2)} %`,
                tekst: dg === null ? "Tillegg oppå innkjøpsprisen" : `Gir ${num(dg, 1)} % dekningsgrad`,
                eks: `+ ${kr(eksUtsalg - eksInnkjop)}`,
              },
              {
                tittel: "= Salgspris eks. mva",
                tekst: "Avrundet og lagret på hver vare",
                eks: kr(eksUtsalg),
              },
              {
                tittel: `+ Mva ${num(mvaSats, 0)} %`,
                tekst: "Det privatkunder betaler",
                eks: kr(eksInkl),
              },
            ].map((steg, i, arr) => (
              <li key={steg.tittel} className="contents">
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-sm font-semibold">{steg.tittel}</p>
                  <p className="text-xs text-muted-foreground">{steg.tekst}</p>
                  <p className="mt-2 tabular text-lg font-semibold">{steg.eks}</p>
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight
                    className="mx-auto hidden h-4 w-4 self-center text-muted-foreground sm:block"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            Eksempel på en vare som koster 100 kroner inn. Påslag regnes av innkjøpsprisen, dekningsgrad av
            salgsprisen – derfor er {num(paaslagProsent, 2)} % påslag bare {dg === null ? "–" : num(dg, 1)} % av det
            kunden betaler.
            {ulagraPaaslag && " Påslaget i feltet under er ikke lagret ennå; oversikten viser det som gjelder nå."}
          </p>
        </div>

        {/* ------------------------------------------------ nøkkeltal */}
        {types.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {ruter.map((r) => {
                const valt = status === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setStatus(valt ? ALLE : r.key)}
                    aria-pressed={valt}
                    className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 ${
                      valt ? "border-primary bg-muted/60" : "border-border"
                    }`}
                  >
                    <p className={`text-xs font-semibold ${STATUS_FARGE[r.key as PrisStatus]}`}>{r.tittel}</p>
                    <p className="tabular text-xl font-semibold">{r.verdi}</p>
                    <p className="text-xs text-muted-foreground">{r.under}</p>
                  </button>
                );
              })}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Snitt påslag</dt>
                <dd className="tabular font-semibold">{prosent(sum.snittPaaslag)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Lavest / høyest påslag</dt>
                <dd className="tabular font-semibold">
                  {prosent(sum.lavestPaaslag)} / {prosent(sum.hoyestPaaslag)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Lagerverdi innkjøp / salg</dt>
                <dd className="tabular font-semibold">
                  {kr(sum.lagerverdiInnkjop)} / {kr(sum.lagerverdiUtsalg)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tillegg på det som ligger på lager</dt>
                <dd className="tabular font-semibold">{kr(sum.lagerverdiUtsalg - sum.lagerverdiInnkjop)}</dd>
              </div>
            </dl>
          </>
        )}

        {/* ------------------------------------------------ filter */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="pris-sok">Søk</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="pris-sok"
                className="h-11 pl-9"
                placeholder="Navn, dimensjon eller varenummer"
                value={sok}
                onChange={(e) => setSok(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pris-gruppe">Varegruppe</Label>
            <Select value={gruppe} onValueChange={setGruppe}>
              <SelectTrigger id="pris-gruppe" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle varegrupper</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pris-sortering">Sortering</Label>
            <Select value={sortering} onValueChange={(v) => setSortering(v as Sortering)}>
              <SelectTrigger id="pris-sortering" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTERINGAR.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ------------------------------------------------ tabellen */}
        {types.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : viste.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen varer passer med søket og filteret.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {num(viste.length, 0)} varer
              {status !== ALLE && ` · ${PRIS_STATUS_LABEL[status].toLowerCase()}`}
              {status !== ALLE && (
                <>
                  {" · "}
                  <button type="button" className="underline underline-offset-2" onClick={() => setStatus(ALLE)}>
                    vis alle
                  </button>
                </>
              )}
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[56rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vare</TableHead>
                    <TableHead className="text-right">Innkjøp</TableHead>
                    <TableHead className="text-right">Tillegg</TableHead>
                    <TableHead className="text-right">Påslag</TableHead>
                    <TableHead className="text-right">Salgspris eks. mva</TableHead>
                    <TableHead className="text-right">Inkl. mva</TableHead>
                    <TableHead className="text-right">Dekningsgrad</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rader.map((l) => (
                    <TableRow key={l.vare.id} className={l.vare.active ? undefined : "opacity-60"}>
                      <TableCell>
                        <p className="font-medium">{pipeLabel(l.vare.name, l.vare.dimension)}</p>
                        <p className="text-xs text-muted-foreground">
                          {[l.vare.sku, `per ${l.vare.unit}`, !l.vare.active && "inaktiv"].filter(Boolean).join(" · ")}
                        </p>
                      </TableCell>
                      <TableCell className="tabular text-right text-sm">{kr(l.innkjop)}</TableCell>
                      <TableCell className="tabular text-right text-sm">
                        {l.tillegg === null ? "–" : `${l.tillegg > 0 ? "+" : ""}${kr(l.tillegg)}`}
                      </TableCell>
                      <TableCell className="tabular text-right text-sm font-semibold">{prosent(l.paaslag)}</TableCell>
                      <TableCell className="tabular text-right text-sm font-semibold">{kr(l.utsalg)}</TableCell>
                      <TableCell className="tabular text-right text-sm text-muted-foreground">
                        {kr(l.utsalgInklMva)}
                      </TableCell>
                      <TableCell className="tabular text-right text-sm text-muted-foreground">
                        {prosent(l.dekningsgrad)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className={`font-medium ${STATUS_FARGE[l.status]}`}>{PRIS_STATUS_LABEL[l.status]}</span>
                        {(l.status === "avvik" || l.status === "utenPris") && l.standardPris !== null && (
                          <p className="tabular text-xs text-muted-foreground">Standard gir {kr(l.standardPris)}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {viste.length > FORSTE_RADER && (
              <Button variant="outline" size="sm" onClick={() => setVisAlle((v) => !v)}>
                {visAlle ? `Vis bare de første ${FORSTE_RADER}` : `Vis alle ${num(viste.length, 0)} varer`}
              </Button>
            )}
          </div>
        )}

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Tillegg</span> er kronene som ligger oppå innkjøpsprisen.{" "}
            <span className="font-medium text-foreground">Påslag</span> er tillegget i prosent av innkjøpsprisen.{" "}
            <span className="font-medium text-foreground">Dekningsgrad</span> er tillegget i prosent av salgsprisen.
          </li>
          <li>
            «Avviker» betyr at salgsprisen er satt for hånd under Lager, eller regnet med et annet påslag. «Oppdater
            prisene» under setter dem tilbake til standard.
          </li>
          <li>Lagerverdien er beholdning × pris, bare for varer som har både innkjøps- og salgspris.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
