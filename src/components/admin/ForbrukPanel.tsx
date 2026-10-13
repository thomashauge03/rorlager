// Forbruket frå lageret: per prosjekt i eit panel, og for alle prosjekt som
// CSV for ein periode. Uttak som ein tilsett har ført på eit prosjekt frå lista.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/Stat";
import { useToast } from "@/hooks/use-toast";
import { dateTime, kr, pipeLabel, qtyLabel } from "@/lib/format";
import { QK, fetchOrders } from "@/lib/orders";
import { forbrukCsv, forbrukLinjer, lastNedCsv, summerForbruk, type ProsjektNamn } from "@/lib/forbruk";
import type { ProjectRow } from "@/lib/types";

const filtrygg = (s: string) =>
  s
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "o")
    .replace(/[å]/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/* ------------------------------------------------------------------ */
/*  Eitt prosjekt                                                      */
/* ------------------------------------------------------------------ */

export function ForbrukPanel({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const ordrar = useQuery({
    queryKey: [...QK.orders, "forbruk", project.id],
    queryFn: () => fetchOrders({ projectId: project.id }),
  });
  const namn = useMemo(
    () => new Map<string, ProsjektNamn>([[project.id, { project_number: project.project_number, name: project.name }]]),
    [project],
  );
  const rader = useMemo(() => forbrukLinjer(ordrar.data ?? [], namn), [ordrar.data, namn]);
  const sum = summerForbruk(rader);
  const uttak = (ordrar.data ?? []).filter((o) => o.kind !== "bestilling");

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle>Forbruk fra lageret</SheetTitle>
          <SheetDescription className="break-words">
            #{project.project_number} {project.name}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {ordrar.isLoading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : ordrar.isError ? (
            <p className="text-sm text-destructive-ink">
              Klarte ikke å hente uttakene. {ordrar.error instanceof Error ? ordrar.error.message : ""}
            </p>
          ) : uttak.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen uttak fra lageret er ført på dette prosjektet ennå.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Stat label="Uttak" value={String(sum.uttak)} />
                <Stat label="Kost" value={`${kr(sum.kost)} kr`} />
                <Stat label="Salg eks. mva" value={`${kr(sum.salg)} kr`} />
              </div>
              {sum.utanKost > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {sum.utanKost} {sum.utanKost === 1 ? "linje mangler" : "linjer mangler"} kostpris og er ikke med i
                  kostsummen.
                </p>
              ) : null}

              <Button
                variant="outline"
                className="h-11 w-full"
                onClick={() =>
                  lastNedCsv(forbrukCsv(rader), `forbruk_${project.project_number}_${filtrygg(project.name)}.csv`)
                }
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Last ned CSV
              </Button>

              <ul className="divide-y divide-border rounded-lg border border-border">
                {uttak.map((o) => (
                  <li key={o.id} className="px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground tabular">Uttak #{o.order_number}</span>
                      <span className="text-xs text-muted-foreground tabular">{dateTime(o.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                    <ul className="mt-1 space-y-0.5">
                      {o.lines.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 break-words text-foreground">{pipeLabel(l.name, l.dimension)}</span>
                          <span className="shrink-0 tabular text-muted-foreground">{qtyLabel(l.quantity, l.unit)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Alle prosjekt, ein periode                                         */
/* ------------------------------------------------------------------ */

const iDag = () => new Date().toISOString().slice(0, 10);
const førsteIMånaden = () => `${iDag().slice(0, 8)}01`;

export function ForbrukEksport({ prosjekter }: { prosjekter: ProjectRow[] }) {
  const { toast } = useToast();
  const [fra, setFra] = useState(førsteIMånaden);
  const [til, setTil] = useState(iDag);
  const [hentar, setHentar] = useState(false);

  const eksporter = async () => {
    setHentar(true);
    try {
      const ordrar = await fetchOrders({ medProsjekt: true, from: fra, to: til });
      const namn = new Map<string, ProsjektNamn>(prosjekter.map((p) => [p.id, { project_number: p.project_number, name: p.name }]));
      const rader = forbrukLinjer(ordrar, namn);
      if (rader.length === 0) {
        toast({ title: "Ingen uttak på prosjekter i perioden" });
        return;
      }
      lastNedCsv(forbrukCsv(rader), `forbruk_${fra}_${til}.csv`);
      const s = summerForbruk(rader);
      toast({ title: "CSV lastet ned", description: `${s.uttak} uttak, ${s.linjer} linjer · kost ${kr(s.kost)} kr` });
    } catch (e) {
      toast({ title: "Klarte ikke å lage eksporten", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setHentar(false);
    }
  };

  return (
    <div className="hm-card space-y-3 p-4">
      <div>
        <p className="font-semibold text-foreground">Forbruk fra lageret – alle prosjekter</p>
        <p className="text-sm text-muted-foreground">
          Uttak som er ført på et prosjekt, som CSV for Excel, SmartDok eller Tripletex. Én rad per vare, med kost og
          salg.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="forbruk-fra">Fra</Label>
          <Input id="forbruk-fra" type="date" className="h-11" value={fra} max={til} onChange={(e) => setFra(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forbruk-til">Til</Label>
          <Input id="forbruk-til" type="date" className="h-11" value={til} min={fra} onChange={(e) => setTil(e.target.value)} />
        </div>
        <Button className="col-span-2 h-11" onClick={eksporter} disabled={hentar || !fra || !til}>
          {hentar ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
          Last ned CSV
        </Button>
      </div>
    </div>
  );
}
