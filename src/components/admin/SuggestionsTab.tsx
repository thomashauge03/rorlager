// Forslaga frå «Annet»: det kundar og tilsette har teke eller bede om, men som
// katalogen mangla. Kvart forslag kan bli ei vare, ein pris på éi linje, eller
// lukkast. Lista er kontoret sin måte å sjå kva som manglar.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Inbox, PackagePlus, Pencil, RotateCcw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { dateTime, kr, num, pipeLabel } from "@/lib/format";
import { QK, fetchCategories, fetchPipeTypes } from "@/lib/orders";
import {
  SUGGESTION_STATUS_LABEL,
  closeSuggestion,
  endreForslag,
  fetchSuggestions,
  kanPrisast,
  priceLine,
  reopenSuggestion,
  type Suggestion,
} from "@/lib/suggestions";
import type { PipeTypeRow } from "@/lib/types";
import { PipeDialog } from "@/components/admin/StockTab";
import { PriceLineDialog, type PrisLinje } from "@/components/admin/PriceLineDialog";
import { EndreAnnetDialog } from "@/components/admin/RettUttak";

type Utsnitt = "nye" | "behandlet";

export function SuggestionsTab({ visKostpris = true }: { visKostpris?: boolean } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [utsnitt, setUtsnitt] = useState<Utsnitt>("nye");
  const [opprett, setOpprett] = useState<Suggestion | null>(null);
  const [prisFor, setPrisFor] = useState<Suggestion | null>(null);
  const [namnFor, setNamnFor] = useState<Suggestion | null>(null);

  const forslag = useQuery({ queryKey: QK.suggestions, queryFn: fetchSuggestions });
  // Vare-dialogen sjekkar at QR-kode og varenummer er ledige, og treng difor heile katalogen
  const types = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes, enabled: opprett !== null });
  const categories = useQuery({ queryKey: QK.categories, queryFn: fetchCategories, enabled: opprett !== null });

  const alle = forslag.data ?? [];
  const nye = alle.filter((s) => s.status === "ny");
  const behandla = alle.filter((s) => s.status !== "ny");
  const synlege = utsnitt === "nye" ? nye : behandla;

  const oppdater = () => {
    queryClient.invalidateQueries({ queryKey: QK.suggestions });
    queryClient.invalidateQueries({ queryKey: QK.orders });
  };

  const avvis = useMutation({
    mutationFn: (s: Suggestion) => closeSuggestion(s.id, "avvist"),
    onSuccess: () => {
      oppdater();
      toast({ title: "Forslaget er avvist" });
    },
    onError: (e: Error) => toast({ title: "Forslaget ble ikke lagret", description: e.message, variant: "destructive" }),
  });

  const opne = useMutation({
    mutationFn: (s: Suggestion) => reopenSuggestion(s.id),
    onSuccess: () => {
      oppdater();
      toast({ title: "Forslaget er åpnet igjen" });
    },
    onError: (e: Error) => toast({ title: "Forslaget ble ikke åpnet", description: e.message, variant: "destructive" }),
  });

  /**
   * Vara er oppretta. Linja forslaget kom frå får prisen hennar – men berre når
   * eininga er den same: ein meterpris på ei linje målt i stykk ville vore feil.
   * Feilar prisen, er vara likevel oppretta, og forslaget blir lukka; linja står
   * då att med «Pris mangler» i Bestillinger og kan prisast der.
   */
  const etterOppretting = async (s: Suggestion, vare: PipeTypeRow) => {
    const prisast = kanPrisast(s) && s.line?.unit_price == null && vare.price !== null && vare.unit === s.unit;
    if (prisast && s.order_line_id) {
      try {
        await priceLine(s.order_line_id, vare.price as number);
      } catch (e) {
        toast({
          title: "Varen er lagt inn, men linja fikk ikke pris",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
      }
    }
    try {
      await closeSuggestion(s.id, "opprettet", vare.id);
    } catch (e) {
      toast({
        title: "Varen er lagt inn, men forslaget står fortsatt som nytt",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
    oppdater();
  };

  const prisLinje: PrisLinje | null =
    prisFor && prisFor.order_line_id
      ? {
          id: prisFor.order_line_id,
          name: prisFor.name,
          dimension: prisFor.dimension,
          unit: prisFor.unit,
          quantity: prisFor.quantity,
          unit_price: prisFor.line?.unit_price ?? null,
        }
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Forslag</h2>
          <p className="text-sm text-muted-foreground">
            Det kunder og ansatte la i kurven med «Annet» fordi lista ikke hadde det.
          </p>
        </div>
        <div role="tablist" aria-label="Utsnitt" className="flex gap-1 rounded-md bg-muted p-1">
          {(
            [
              ["nye", `Nye (${nye.length})`],
              ["behandlet", `Behandlet (${behandla.length})`],
            ] as [Utsnitt, string][]
          ).map(([v, tekst]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={utsnitt === v}
              onClick={() => setUtsnitt(v)}
              className={cn(
                "h-9 rounded px-3 text-sm font-medium transition-colors",
                utsnitt === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tekst}
            </button>
          ))}
        </div>
      </div>

      {forslag.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : forslag.isError ? (
        <div className="hm-card p-6 text-center">
          <p className="font-semibold text-foreground">Klarte ikke å hente forslagene</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {forslag.error instanceof Error ? forslag.error.message : "Prøv igjen."}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => forslag.refetch()}>
            Prøv igjen
          </Button>
        </div>
      ) : synlege.length === 0 ? (
        <div className="hm-card flex flex-col items-center gap-2 p-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold text-foreground">{utsnitt === "nye" ? "Ingen nye forslag" : "Ingen behandlede forslag"}</p>
          <p className="text-sm text-muted-foreground">
            Når noen legger noe i kurven med «Annet», havner det her.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {synlege.map((s) => (
            <ForslagKort
              key={s.id}
              s={s}
              onOpprett={() => setOpprett(s)}
              onNamn={() => setNamnFor(s)}
              onPris={() => setPrisFor(s)}
              onAvvis={() => avvis.mutate(s)}
              onOpne={() => opne.mutate(s)}
              opptatt={avvis.isPending || opne.isPending}
            />
          ))}
        </ul>
      )}

      {opprett && types.data && categories.data ? (
        <PipeDialog
          pipe={null}
          visKostpris={visKostpris}
          allPipes={types.data}
          categories={categories.data}
          initial={{ name: opprett.name, dimension: opprett.dimension ?? "", unit: opprett.unit }}
          onSaved={(vare) => etterOppretting(opprett, vare)}
          onClose={() => setOpprett(null)}
        />
      ) : null}

      {/* Rett namnet først, så blir «Opprett vare» fylt ut med det kontoret
          faktisk meiner og ikkje med det som blei tasta på lageret */}
      <EndreAnnetDialog
        line={namnFor}
        onClose={() => setNamnFor(null)}
        lagreMed={async (name, dimension) => {
          if (namnFor) await endreForslag(namnFor, name, dimension);
        }}
      />

      <PriceLineDialog
        line={prisLinje}
        onClose={() => setPrisFor(null)}
        onPriced={async () => {
          if (prisFor) await closeSuggestion(prisFor.id, "engangs");
        }}
      />
    </div>
  );
}

function ForslagKort({
  s,
  onOpprett,
  onNamn,
  onPris,
  onAvvis,
  onOpne,
  opptatt,
}: {
  s: Suggestion;
  onOpprett: () => void;
  onNamn: () => void;
  onPris: () => void;
  onAvvis: () => void;
  onOpne: () => void;
  opptatt: boolean;
}) {
  const ordre = s.order;
  const harPris = s.line?.unit_price !== null && s.line?.unit_price !== undefined;

  return (
    <li className="hm-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-bold text-foreground">{pipeLabel(s.name, s.dimension)}</p>
          <p className="tabular text-sm text-muted-foreground">
            {num(s.quantity)} {s.unit} · {dateTime(s.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              s.from_employee ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {s.from_employee ? "Ansatt" : "Kunde"}
          </span>
          {s.status !== "ny" ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {SUGGESTION_STATUS_LABEL[s.status]}
            </span>
          ) : null}
        </div>
      </div>

      {s.note ? <p className="mt-2 break-words rounded-md bg-muted px-3 py-2 text-sm text-foreground">{s.note}</p> : null}

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Fra</dt>
          <dd className="break-words text-foreground">{s.submitted_by ?? "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ordre</dt>
          <dd className="text-foreground">
            {ordre ? (
              <Link
                to={`/admin?fane=bestillinger&ordre=${ordre.order_number}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {ordre.kind === "bestilling" ? "Bestilling" : "Uttak"} #{ordre.order_number}
              </Link>
            ) : (
              "Ordren er slettet"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pris på linja</dt>
          <dd className="tabular text-foreground">
            {!ordre || !s.line
              ? "–"
              : harPris
                ? `${kr(s.line.unit_price as number)} kr/${s.unit}`
                : ordre.invoice_id
                  ? "Mangler (fakturert)"
                  : "Mangler"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {s.status === "ny" ? (
          <>
            <Button size="sm" onClick={onOpprett} className="h-10 [&_svg]:size-4">
              <PackagePlus aria-hidden="true" />
              Opprett vare
            </Button>
            <Button size="sm" variant="outline" onClick={onNamn} className="h-10 [&_svg]:size-4">
              <Pencil aria-hidden="true" />
              Endre navn
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onPris}
              disabled={!kanPrisast(s)}
              title={kanPrisast(s) ? undefined : "Ordren er slettet eller fakturert"}
              className="h-10 [&_svg]:size-4"
            >
              <Tag aria-hidden="true" />
              {harPris ? "Endre pris" : "Sett pris"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onAvvis} disabled={opptatt} className="h-10 text-muted-foreground [&_svg]:size-4">
              <Ban aria-hidden="true" />
              Avvis
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={onOpne} disabled={opptatt} className="h-10 text-muted-foreground [&_svg]:size-4">
            <RotateCcw aria-hidden="true" />
            Åpne igjen
          </Button>
        )}
      </div>
    </li>
  );
}
