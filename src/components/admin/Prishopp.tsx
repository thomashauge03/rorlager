// Prishopp: heve eller senke prisane med nokre prosent når kronen svingar, utan
// å røre påslaget – og sporet som viser kva som er gjort sidan siste prisliste.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, TrendingUp } from "lucide-react";

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

import { useToast } from "@/hooks/use-toast";
import { dateTime, kr, longDate, num, parseNum, pipeLabel } from "@/lib/format";
import { QK, fetchCategories, fetchPipeTypes, rundPris } from "@/lib/orders";
import { STANDARD_AVRUNDING, avrundingTekst, spreiddUtval, type Avrunding } from "@/lib/prisoversikt";
import {
  SLAG_LABEL,
  fetchPrisHendingar,
  hoppSidanImport,
  prisEtterHopp,
  prishopp,
  type PrisHending,
} from "@/lib/prishopp";
import { sistePrislisteDato } from "@/lib/stock";

const ALLE = "alle";
const EKSEMPEL = 6;
const FORSTE_HENDINGAR = 15;

const pluss = (v: number, des = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), des)} %`;

export function Prishopp({
  paaslagProsent,
  avrunding = STANDARD_AVRUNDING,
}: {
  paaslagProsent: number;
  /** Den lagra avrundinga. Retninga les basen sjølv; trinnet blir sendt med. */
  avrunding?: Avrunding;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories });
  const hendingar = useQuery({ queryKey: QK.prishendingar, queryFn: () => fetchPrisHendingar(), retry: false });

  const [prosentTekst, setProsentTekst] = useState("");
  const [grunn, setGrunn] = useState("");
  const [utval, setUtval] = useState(ALLE);
  const [stadfest, setStadfest] = useState(false);
  const [visAlle, setVisAlle] = useState(false);

  // Minus-teikn frå mobiltastaturet kan vere ‑ eller −, ikkje berre -
  const prosent = prosentTekst.trim() ? parseNum(prosentTekst.replace(/[−‑–]/g, "-")) : null;
  const prosentOk = prosent !== null && prosent !== 0 && prosent >= -50 && prosent <= 100;
  const grunnOk = grunn.trim().length > 0 && grunn.length <= 200;
  const round = avrunding.steg;

  const sidan = useMemo(() => hoppSidanImport(hendingar.data ?? []), [hendingar.data]);
  const prislisteDato = useMemo(
    () => sidan.import?.created_at ?? sistePrislisteDato(types.data ?? []),
    [sidan.import, types.data],
  );

  const iUtvalet = useMemo(() => {
    const rader = (types.data ?? []).filter((t) => t.price !== null || t.cost_price !== null);
    return utval === ALLE ? rader : rader.filter((t) => t.category_id === utval);
  }, [types.data, utval]);

  const eksempel = useMemo(
    () => spreiddUtval(iUtvalet.filter((t) => t.price !== null), (t) => t.price ?? 0, EKSEMPEL),
    [iUtvalet],
  );

  const utvalNamn =
    utval === ALLE ? "alle varer" : (categories.data ?? []).find((c) => c.id === utval)?.name ?? "varegruppen";

  const legg = useMutation({
    mutationFn: () => prishopp(prosent as number, grunn.trim(), { categoryId: utval === ALLE ? null : utval, roundTo: round }),
    onSuccess: (n) => {
      setStadfest(false);
      toast({ title: `${num(n, 0)} varer fikk prishopp ${pluss(prosent as number)}`, description: grunn.trim() });
      setProsentTekst("");
      setGrunn("");
      qc.invalidateQueries({ queryKey: QK.types });
      qc.invalidateQueries({ queryKey: QK.prishendingar });
    },
    onError: (e: unknown) =>
      toast({
        title: "Prishoppet ble ikke lagt på",
        description: e instanceof Error ? e.message : "Ukjent feil",
        variant: "destructive",
      }),
  });

  const samla = (sidan.faktor - 1) * 100;
  const liste = hendingar.data ?? [];
  const viste = visAlle ? liste : liste.slice(0, FORSTE_HENDINGAR);

  return (
    <Card className="hm-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prishopp</CardTitle>
        <p className="text-sm text-muted-foreground">
          Hev eller senk prisene når kronen svinger, uten å røre påslaget. Hoppet legges oppå påslaget, står i
          prissporet med grunn og dato, og nullstilles når en ny prisliste fra Dahl importeres.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ------------------------------------------------ status no */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              {prislisteDato ? <>Siden prislisten {longDate(prislisteDato)}</> : "Siden prissporet startet"}
            </p>
            <p className="tabular text-xl font-semibold">{sidan.hopp.length === 0 ? "Ingen hopp" : pluss(samla)}</p>
          </div>
          {sidan.hopp.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {sidan.hopp.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3">
                  <span className="tabular w-16 font-semibold">{pluss(h.prosent ?? 0)}</span>
                  <span className="text-muted-foreground">{dateTime(h.created_at)}</span>
                  <span className="break-words">{h.grunn}</span>
                </li>
              ))}
            </ul>
          )}
          {sidan.gruppehopp.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              I tillegg {sidan.gruppehopp.length === 1 ? "ett hopp" : `${sidan.gruppehopp.length} hopp`} på enkelte
              varegrupper – se prissporet under. Prisoversikten viser hoppet på hver vare.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            En vare til 100 kr fra Dahl koster nå{" "}
            {kr(rundPris(100 * (1 + paaslagProsent / 100) * sidan.faktor, avrunding.steg, avrunding.opp))} kr eks. mva: {num(paaslagProsent, 2)} %
            påslag{sidan.hopp.length > 0 ? ` og ${pluss(samla)} prishopp` : ""}.
          </p>
        </div>

        {hendingar.isError && (
          <p className="text-sm text-destructive-ink">
            {hendingar.error instanceof Error ? hendingar.error.message : "Klarte ikke å hente prissporet."}
          </p>
        )}

        {/* ------------------------------------------------ nytt hopp */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hopp-prosent">Prishopp (%)</Label>
            <Input
              id="hopp-prosent"
              className="h-11 tabular"
              inputMode="text"
              placeholder="5 eller -2"
              value={prosentTekst}
              onChange={(e) => setProsentTekst(e.target.value)}
              aria-invalid={prosentTekst.trim() !== "" && !prosentOk}
            />
            <p className={`text-xs ${prosentTekst.trim() !== "" && !prosentOk ? "text-destructive-ink" : "text-muted-foreground"}`}>
              {prosentTekst.trim() !== "" && !prosentOk
                ? "Et tall mellom -50 og 100, ikke 0."
                : "Minus senker prisene."}
            </p>
          </div>
          <div className="space-y-1.5 lg:col-span-1">
            <Label htmlFor="hopp-grunn">Grunn</Label>
            <Input
              id="hopp-grunn"
              className="h-11"
              placeholder="Kronen svekket mot euro"
              maxLength={200}
              value={grunn}
              onChange={(e) => setGrunn(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Står i prissporet, så dere ser hvorfor senere.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hopp-utval">Hva skal justeres</Label>
            <Select value={utval} onValueChange={setUtval}>
              <SelectTrigger id="hopp-utval" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLE}>Alle varer</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {types.isLoading ? "Teller opp varene …" : `${num(iUtvalet.length, 0)} varer med pris.`}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Avrundes {avrunding.opp && avrunding.steg !== 0.01 ? avrundingTekst(avrunding) : `til ${avrundingTekst(avrunding)}`}, som
          satt under Avanse over Dahl.
        </p>

        {types.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : eksempel.length > 0 ? (
          <div className="space-y-2">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[36rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vare</TableHead>
                    <TableHead className="text-right">Dahl</TableHead>
                    <TableHead className="text-right">Pris i dag</TableHead>
                    <TableHead className="text-right">Ny pris</TableHead>
                    <TableHead className="text-right">Endring</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eksempel.map((t) => {
                    const ny = prosentOk ? prisEtterHopp(t, paaslagProsent, prosent as number, round, avrunding.opp) : null;
                    const diff = ny === null || t.price === null ? null : ny - t.price;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{pipeLabel(t.name, t.dimension)}</TableCell>
                        <TableCell className="tabular text-right text-sm text-muted-foreground">{kr(t.cost_price)}</TableCell>
                        <TableCell className="tabular text-right text-sm text-muted-foreground">{kr(t.price)}</TableCell>
                        <TableCell className="tabular text-right text-sm font-semibold">{ny === null ? "–" : kr(ny)}</TableCell>
                        <TableCell className="tabular text-right text-sm text-muted-foreground">
                          {diff === null ? "–" : `${diff > 0 ? "+" : ""}${kr(diff)}`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Varer som følger påslaget regnes fra Dahl-prisen; varer med pris satt for hånd får hoppet på prisen de
              har.
            </p>
          </div>
        ) : null}

        <Button
          className="h-11"
          variant="outline"
          onClick={() => setStadfest(true)}
          disabled={!prosentOk || !grunnOk || iUtvalet.length === 0 || legg.isPending}
        >
          {legg.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <TrendingUp className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Legg på prishopp
        </Button>

        {/* ------------------------------------------------ prissporet */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">Prisspor</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Hver prisliste, påslagskjøring og prishopp – med hvem, når og hvor mange varer. Kan ikke endres. Hver
            enkelt prisendring står i endringsloggen nederst.
          </p>
          {hendingar.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : liste.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingenting her ennå. Sporet starter med neste prisendring.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {viste.map((h) => (
                <HendingRad key={h.id} h={h} />
              ))}
            </ul>
          )}
          {liste.length > FORSTE_HENDINGAR && (
            <Button variant="outline" size="sm" onClick={() => setVisAlle((v) => !v)}>
              {visAlle ? "Vis færre" : `Vis alle ${liste.length}`}
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={stadfest} onOpenChange={(o) => !legg.isPending && setStadfest(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Prishopp {prosent === null ? "" : pluss(prosent)} på {num(iUtvalet.length, 0)} varer?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {utvalNamn.charAt(0).toUpperCase() + utvalNamn.slice(1)} får nye priser med en gang. Grunn: «{grunn.trim()}».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Påslaget står som det er. Hoppet legges oppå og står i prissporet.</li>
            <li>Bestillinger som alt er sendt inn, beholder prisene sine.</li>
            <li>Neste prisliste fra Dahl nullstiller hoppet på varene den har med.</li>
            <li>Vil du tilbake, legg på et hopp motsatt vei.</li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={legg.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Dialogen står til basen har svart, så ein feil blir sett
                e.preventDefault();
                legg.mutate();
              }}
              disabled={legg.isPending}
            >
              {legg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Legg på prishopp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function HendingRad({ h }: { h: PrisHending }) {
  const prosentTekst =
    h.prosent === null ? "" : h.slag === "hopp" ? pluss(h.prosent) : `${num(h.prosent, 2)} % påslag`;
  return (
    <li className="space-y-0.5 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {SLAG_LABEL[h.slag]} {prosentTekst && <span className="tabular">{prosentTekst}</span>}
        </p>
        <span className="tabular text-xs text-muted-foreground">{dateTime(h.created_at)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {[
          h.grunn ? `«${h.grunn}»` : null,
          h.kategori_namn ?? (h.category_id ? "én varegruppe" : "alle varer"),
          `${num(h.antall, 0)} varer`,
          h.slag === "import" ? "prishopp nullstilt" : null,
          `av ${h.created_by_name ?? "ukjent"}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}
