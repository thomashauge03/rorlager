// Endringsloggen i Innstillinger, og prishistorikken i vare-dialogen. Begge
// les revisjonssporet; ingen av dei kan endre det.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { dateTime } from "@/lib/format";
import { searchKey } from "@/lib/stock";
import { TABELL_LABEL, beskrivEndring, fetchRevisjon, type Revisjon } from "@/lib/revisjon";

const HANDLING: Record<Revisjon["handling"], string> = { ny: "Ny", endret: "Endret", slettet: "Slettet" };

function Rad({ r, visTabell = true }: { r: Revisjon; visTabell?: boolean }) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 break-words text-sm font-medium text-foreground">
          {visTabell ? <span className="text-muted-foreground">{TABELL_LABEL[r.tabell] ?? r.tabell} · </span> : null}
          {r.kva ?? "–"}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{HANDLING[r.handling]}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular">{dateTime(r.created_at)}</span>
      </div>
      <p className="break-words text-sm text-foreground">{beskrivEndring(r) || "–"}</p>
      <p className="text-xs text-muted-foreground">av {r.created_by_name ?? "ukjent"}</p>
    </li>
  );
}

export function EndringsLogg() {
  const [tabell, setTabell] = useState("alle");
  const [søk, setSøk] = useState("");
  const logg = useQuery({
    queryKey: ["pipe_revisjon", tabell],
    queryFn: () => fetchRevisjon({ tabell: tabell === "alle" ? undefined : tabell }),
  });
  const viste = useMemo(() => {
    const q = searchKey(søk);
    const rader = logg.data ?? [];
    if (!q) return rader;
    return rader.filter((r) =>
      searchKey(`${r.kva ?? ""} ${r.created_by_name ?? ""} ${beskrivEndring(r)}`).includes(q),
    );
  }, [logg.data, søk]);

  return (
    <section className="hm-card space-y-3 p-4" aria-labelledby="endringslogg">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="endringslogg" className="text-base font-semibold text-foreground">
          Endringslogg
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Hvem som endret priser, påslag, uttak, fakturagrunnlag og tilganger – og når. Loggen skrives av databasen og kan
        ikke endres. Lagerbeholdningen står i lagerloggen.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="logg-type">Vis</Label>
          <Select value={tabell} onValueChange={setTabell}>
            <SelectTrigger id="logg-type" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alt</SelectItem>
              {Object.entries(TABELL_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logg-sok">Søk</Label>
          <Input
            id="logg-sok"
            className="h-11"
            placeholder="Vare, ordrenummer, person …"
            value={søk}
            onChange={(e) => setSøk(e.target.value)}
          />
        </div>
      </div>

      {logg.isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : logg.isError ? (
        <p className="text-sm text-muted-foreground">
          Endringsloggen er ikke tilgjengelig ennå. Kjør supabase-setup.sql på nytt (20261014190000).
        </p>
      ) : viste.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen endringer å vise.</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {viste.map((r) => (
            <Rad key={r.id} r={r} />
          ))}
        </ul>
      )}
      {logg.data && logg.data.length >= 300 ? (
        <p className="text-xs text-muted-foreground">Viser de siste 300. Velg en type eller søk for å finne eldre.</p>
      ) : null}
    </section>
  );
}

/** Pris- og kostprisendringane for éi vare, nyaste først. */
export function Prishistorikk({ pipeTypeId }: { pipeTypeId: string }) {
  const logg = useQuery({
    queryKey: ["pipe_revisjon", "pipe_types", pipeTypeId],
    queryFn: () => fetchRevisjon({ tabell: "pipe_types", radId: pipeTypeId, grense: 50 }),
  });
  const prisar = (logg.data ?? []).filter(
    (r) => r.handling === "endret" && ("price" in r.endringar || "cost_price" in r.endringar),
  );
  if (logg.isError || prisar.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">Prishistorikk</p>
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {prisar.map((r) => (
          <Rad key={r.id} r={{ ...r, endringar: Object.fromEntries(Object.entries(r.endringar).filter(([k]) => k === "price" || k === "cost_price")) }} visTabell={false} />
        ))}
      </ul>
    </div>
  );
}
