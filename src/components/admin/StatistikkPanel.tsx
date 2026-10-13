// Statistikk over lageret for ein periode: kva som går, kva som står, kven som
// tek mest, og salet per månad.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { kr, num, pipeLabel } from "@/lib/format";
import { QK, fetchOrders } from "@/lib/orders";
import { mestTattUt, perMånad, stårStille, toppkundar, visMånad } from "@/lib/statistikk";
import type { PipeType } from "@/lib/types";

async function hentForbruk(dagar: number): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("pipe_forbruk_per_vare", { p_dagar: dagar });
  if (error) throw new Error(error.message || "Klarte ikke å hente forbruket");
  return new Map(((data ?? []) as { pipe_type_id: string; forbruk: number | string }[]).map((r) => [r.pipe_type_id, Number(r.forbruk)]));
}

const fraDato = (dagar: number) => new Date(Date.now() - dagar * 86_400_000).toISOString().slice(0, 10);

function Tabell({ tittel, hjelp, children }: { tittel: string; hjelp?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{tittel}</h3>
        {hjelp ? <p className="text-xs text-muted-foreground">{hjelp}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Rad({ venstre, under, høgre }: { venstre: string; under?: string; høgre: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="min-w-0">
        <span className="block break-words text-sm text-foreground">{venstre}</span>
        {under ? <span className="block text-xs text-muted-foreground tabular">{under}</span> : null}
      </span>
      <span className="shrink-0 text-sm font-semibold text-foreground tabular">{høgre}</span>
    </li>
  );
}

export function StatistikkPanel({ varer, visKostpris, onClose }: { varer: PipeType[]; visKostpris: boolean; onClose: () => void }) {
  const [dagar, setDagar] = useState(90);
  const forbruk = useQuery({ queryKey: ["pipe_forbruk_per_vare", dagar], queryFn: () => hentForbruk(dagar) });
  const ordrar = useQuery({
    queryKey: [...QK.orders, "statistikk", dagar],
    queryFn: () => fetchOrders({ from: fraDato(dagar) }),
  });

  const mest = useMemo(() => (forbruk.data ? mestTattUt(varer, forbruk.data) : []), [varer, forbruk.data]);
  const står = useMemo(() => (forbruk.data ? stårStille(varer, forbruk.data) : []), [varer, forbruk.data]);
  const kundar = useMemo(() => toppkundar(ordrar.data ?? []), [ordrar.data]);
  const månader = useMemo(() => perMånad(ordrar.data ?? []), [ordrar.data]);
  const bundetTotalt = står.reduce((s, r) => s + (r.bundet ?? 0), 0);

  const lastar = forbruk.isLoading || ordrar.isLoading;
  const feil = forbruk.error ?? ordrar.error;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle>Statistikk</SheetTitle>
          <SheetDescription>Hva som går, hva som står, og hvem som tar mest. Beløp eks. mva.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          <div className="flex items-center gap-3">
            <Label htmlFor="stat-periode" className="shrink-0 text-sm">
              Periode
            </Label>
            <Select value={String(dagar)} onValueChange={(v) => setDagar(Number(v))}>
              <SelectTrigger id="stat-periode" className="h-11 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Siste 30 dager</SelectItem>
                <SelectItem value="90">Siste 90 dager</SelectItem>
                <SelectItem value="180">Siste 6 måneder</SelectItem>
                <SelectItem value="365">Siste 12 måneder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {lastar ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : feil ? (
            <p className="text-sm text-destructive-ink">{feil instanceof Error ? feil.message : "Klarte ikke å hente statistikken"}</p>
          ) : (
            <>
              <Tabell tittel="Tas ut mest" hjelp="Netto: returer er trukket fra.">
                {mest.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingenting tatt ut i perioden.</p>
                ) : (
                  <ol className="divide-y divide-border rounded-lg border border-border">
                    {mest.map((r) => (
                      <Rad
                        key={r.vare.id}
                        venstre={pipeLabel(r.vare.name, r.vare.dimension)}
                        under={`${num(r.mengde)} ${r.vare.unit}`}
                        høgre={r.salsverdi == null ? "–" : `${kr(r.salsverdi)} kr`}
                      />
                    ))}
                  </ol>
                )}
              </Tabell>

              <Tabell tittel="Per måned" hjelp="Uttak og godkjente bestillinger.">
                {månader.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen uttak i perioden.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {månader.map((m) => (
                      <Rad key={m.månad} venstre={visMånad(m.månad)} under={`${m.uttak} uttak`} høgre={`${kr(m.sum)} kr`} />
                    ))}
                  </ul>
                )}
              </Tabell>

              <Tabell tittel="Største kunder og jobber" hjelp="Samme gruppering som fakturagrunnlaget.">
                {kundar.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen i perioden.</p>
                ) : (
                  <ol className="divide-y divide-border rounded-lg border border-border">
                    {kundar.map((k) => (
                      <Rad key={k.namn} venstre={k.namn} under={`${k.uttak} uttak`} høgre={`${kr(k.sum)} kr`} />
                    ))}
                  </ol>
                )}
              </Tabell>

              <Tabell
                tittel={`Står uten å bli tatt ut (${står.length})`}
                hjelp={
                  visKostpris && bundetTotalt > 0
                    ? `På lager, men ikke tatt ut i perioden. ${kr(bundetTotalt)} kr bundet i innkjøp.`
                    : "På lager, men ikke tatt ut i perioden."
                }
              >
                {står.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Alt på lager har gått i perioden.</p>
                ) : (
                  <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {står.slice(0, 50).map((r) => (
                      <Rad
                        key={r.vare.id}
                        venstre={pipeLabel(r.vare.name, r.vare.dimension)}
                        under={`${num(r.vare.stock)} ${r.vare.unit} på lager`}
                        høgre={visKostpris && r.bundet != null ? `${kr(r.bundet)} kr` : ""}
                      />
                    ))}
                  </ul>
                )}
              </Tabell>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
