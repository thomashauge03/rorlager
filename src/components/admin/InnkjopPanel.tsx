// Innkjøpsforslaget: varer som er under varselgrensa eller går tom snart, med
// eit forslag til antal ut frå forbruket. Lista kan rettast og sendast til
// Dahl som CSV, tekst eller e-post.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { kr, num, parseNum, pipeLabel, qtyLabel } from "@/lib/format";
import { lastNedCsv } from "@/lib/forbruk";
import { bestillingCsv, bestillingTekst, innkjøpsforslag, type Bestillingslinje } from "@/lib/innkjop";
import type { PipeType } from "@/lib/types";

async function hentForbruk(dagar: number): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("pipe_forbruk_per_vare", { p_dagar: dagar });
  if (error) throw new Error(error.message || "Klarte ikke å hente forbruket");
  return new Map(((data ?? []) as { pipe_type_id: string; forbruk: number | string }[]).map((r) => [r.pipe_type_id, Number(r.forbruk)]));
}

export function InnkjopPanel({
  varer,
  visKostpris,
  onClose,
}: {
  varer: PipeType[];
  visKostpris: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [dagar, setDagar] = useState(90);
  const forbruk = useQuery({ queryKey: ["pipe_forbruk_per_vare", dagar], queryFn: () => hentForbruk(dagar) });

  const forslag = useMemo(
    () => (forbruk.data ? innkjøpsforslag(varer, forbruk.data, dagar) : []),
    [varer, forbruk.data, dagar],
  );

  // Det kontoret har retta eller kryssa vekk, per vare
  const [mengde, setMengde] = useState<Record<string, string>>({});
  const [med, setMed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setMengde(Object.fromEntries(forslag.map((f) => [f.vare.id, String(f.forslag)])));
    setMed(Object.fromEntries(forslag.map((f) => [f.vare.id, true])));
  }, [forslag]);

  const valde: (Bestillingslinje & { kost: number | null })[] = forslag
    .filter((f) => med[f.vare.id])
    .map((f) => {
      const m = parseNum(mengde[f.vare.id] ?? "") ?? 0;
      return {
        varenr: f.vare.sku ?? "",
        vare: pipeLabel(f.vare.name, f.vare.dimension),
        mengde: m,
        enhet: f.vare.unit,
        kost: f.vare.cost_price == null ? null : f.vare.cost_price * m,
      };
    })
    .filter((l) => l.mengde > 0);
  const sumKost = valde.reduce((s, l) => s + (l.kost ?? 0), 0);
  const iDag = new Date().toISOString().slice(0, 10);

  const kopier = async () => {
    try {
      await navigator.clipboard.writeText(bestillingTekst(valde));
      toast({ title: "Lista er kopiert", description: "Lim den inn i en e-post eller melding til Dahl." });
    } catch {
      toast({ title: "Klarte ikke å kopiere", variant: "destructive" });
    }
  };

  const epost = () => {
    const kropp = `Hei,\n\nVi ønsker å bestille:\n\n${bestillingTekst(valde)}\n\nMvh\n`;
    window.location.href = `mailto:?subject=${encodeURIComponent(`Bestilling ${iDag}`)}&body=${encodeURIComponent(kropp)}`;
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle>Innkjøpsforslag</SheetTitle>
          <SheetDescription>
            Varer på eller under varselgrensen, og varer uten grense som går tom innen 14 dager. Forslaget fyller opp til
            30 dagers forbruk over grensen.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="innkjop-periode" className="shrink-0 text-sm">
              Forbruk siste
            </Label>
            <Select value={String(dagar)} onValueChange={(v) => setDagar(Number(v))}>
              <SelectTrigger id="innkjop-periode" className="h-11 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 dager</SelectItem>
                <SelectItem value="90">90 dager</SelectItem>
                <SelectItem value="180">180 dager</SelectItem>
                <SelectItem value="365">12 måneder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {forbruk.isLoading ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : forbruk.isError ? (
            <p className="text-sm text-destructive-ink">
              {forbruk.error instanceof Error ? forbruk.error.message : "Klarte ikke å hente forbruket"}
            </p>
          ) : forslag.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingenting å bestille nå. Sett en varselgrense på varene som skal føres på lager, så kommer de med her når de
              går lavt.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {forslag.map((f) => (
                  <li key={f.vare.id} className="flex items-start gap-3 px-3 py-2.5">
                    <Checkbox
                      id={`innkjop-${f.vare.id}`}
                      className="mt-1 h-5 w-5"
                      checked={med[f.vare.id] ?? false}
                      onCheckedChange={(v) => setMed((m) => ({ ...m, [f.vare.id]: v === true }))}
                      aria-label={`Ta med ${pipeLabel(f.vare.name, f.vare.dimension)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`innkjop-${f.vare.id}`} className="block cursor-pointer text-sm font-medium text-foreground break-words">
                        {pipeLabel(f.vare.name, f.vare.dimension)}
                      </label>
                      <p className="text-xs text-muted-foreground tabular">
                        {f.vare.sku ?? "Uten varenr."} · {num(f.vare.stock)} {f.vare.unit} på lager
                        {f.vare.low_stock_threshold > 0 ? ` · grense ${num(f.vare.low_stock_threshold)}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground tabular">
                        {f.perDag > 0
                          ? `Bruker ${qtyLabel(Math.round(f.perDag * 30 * 10) / 10, f.vare.unit)} i måneden${
                              f.dagarIgjen !== null ? ` · tom om ${Math.floor(f.dagarIgjen)} dager` : ""
                            }`
                          : "Ikke tatt ut i perioden"}
                      </p>
                    </div>
                    <div className="w-24 shrink-0">
                      <Label htmlFor={`innkjop-mengde-${f.vare.id}`} className="sr-only">
                        Antall {f.vare.unit}
                      </Label>
                      <div className="flex items-center gap-1">
                        <Input
                          id={`innkjop-mengde-${f.vare.id}`}
                          className="h-11 text-right tabular"
                          inputMode="decimal"
                          value={mengde[f.vare.id] ?? ""}
                          onChange={(e) => setMengde((m) => ({ ...m, [f.vare.id]: e.target.value }))}
                        />
                        <span className="text-xs text-muted-foreground">{f.vare.unit}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="text-sm text-muted-foreground">
                {valde.length} {valde.length === 1 ? "vare" : "varer"} valgt
                {visKostpris && sumKost > 0 ? ` · ca. ${kr(sumKost)} kr i innkjøp` : ""}
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  className="h-11"
                  disabled={valde.length === 0}
                  onClick={() => lastNedCsv(bestillingCsv(valde), `bestilling_dahl_${iDag}.csv`)}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  CSV
                </Button>
                <Button variant="outline" className="h-11" disabled={valde.length === 0} onClick={kopier}>
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                  Kopier
                </Button>
                <Button variant="outline" className="h-11" disabled={valde.length === 0} onClick={epost}>
                  <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                  E-post
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
