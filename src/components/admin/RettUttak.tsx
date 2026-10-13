// Kontoret rettar eit uttak: anna prosjekt, nytt namn på ei annet-linje, eller
// ei anna vare på ei linje. Opna frå detaljane i Bestillinger.
//
// Basen gjer jobben (pipe_bytt_prosjekt, pipe_endre_annet, pipe_bytt_vare):
// han sjekkar kontoret, nektar ein fakturert ordre, og skriv lager, sum og
// forslag i same transaksjon. Her er berre skjemaa.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProsjektVelger, type ProsjektSvar } from "@/components/ProsjektVelger";
import { useToast } from "@/hooks/use-toast";
import { kr, num, pipeLabel, qtyLabel } from "@/lib/format";
import { QK, fetchPipeTypes, fetchProsjektliste } from "@/lib/orders";
import { matchesSearch } from "@/lib/stock";
import { byttProsjekt, byttVare, endreAnnet } from "@/lib/suggestions";
import type { PipeType } from "@/lib/types";

/** Det dialogane treng å vite om ei linje. */
export type RettLinje = {
  id: string;
  name: string;
  dimension: string | null;
  unit: string;
  quantity: number;
  pipe_type_id: string | null;
  is_annet?: boolean | null;
};

/** Etter ei retting skal ordrane, forslaga og lageret lesast på nytt. */
function useEtterRetting() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: QK.orders });
    queryClient.invalidateQueries({ queryKey: QK.suggestions });
    queryClient.invalidateQueries({ queryKey: QK.types });
  };
}

/* ------------------------------------------------------------------ */
/*  Prosjektet                                                         */
/* ------------------------------------------------------------------ */

export function ByttProsjektDialog({
  order,
  onClose,
}: {
  /** Null held dialogen lukka. */
  order: { id: string; order_number: number; project: string | null; project_id?: string | null } | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const etter = useEtterRetting();
  const liste = useQuery({ queryKey: ["pipe_prosjektliste", "kontor"], queryFn: fetchProsjektliste, enabled: !!order });
  const [valg, setValg] = useState<ProsjektSvar>(null);
  const [tekst, setTekst] = useState("");

  useEffect(() => {
    setValg(null);
    // Eit fritekstprosjekt blir ståande i feltet, så ein skrivefeil kan rettast
    setTekst(order && !order.project_id ? order.project ?? "" : "");
  }, [order]);

  const medListe = liste.isSuccess && liste.data.length > 0;
  const brukTekst = !medListe || valg?.kind === "annet";
  const klar = brukTekst ? tekst.trim().length > 0 : valg?.kind === "prosjekt";

  const lagre = useMutation({
    mutationFn: async () => {
      if (!order) return;
      if (!brukTekst && valg?.kind === "prosjekt") await byttProsjekt(order.id, { projectId: valg.id });
      else await byttProsjekt(order.id, { tekst: tekst.trim() });
    },
    onSuccess: () => {
      etter();
      toast({ title: "Prosjektet er byttet" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Prosjektet ble ikke byttet", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {order ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (klar) lagre.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Bytt prosjekt</DialogTitle>
              <DialogDescription className="break-words">
                Uttak #{order.order_number} · nå: {order.project ?? "ikke satt"}
              </DialogDescription>
            </DialogHeader>

            {liste.isLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : medListe ? (
              <ProsjektVelger
                prosjekter={liste.data}
                valgt={valg}
                onVelg={setValg}
                annetTekst={tekst}
                onAnnetTekst={setTekst}
              />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="prosjekt">Prosjekt eller jobb</Label>
                <Input id="prosjekt" className="h-11" value={tekst} onChange={(e) => setTekst(e.target.value)} autoFocus />
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={onClose}>
                Avbryt
              </Button>
              <Button type="submit" disabled={!klar || lagre.isPending}>
                {lagre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Bytt prosjekt
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Namnet på ei annet-linje                                           */
/* ------------------------------------------------------------------ */

export function EndreAnnetDialog({ line, onClose }: { line: RettLinje | null; onClose: () => void }) {
  const { toast } = useToast();
  const etter = useEtterRetting();
  const [namn, setNamn] = useState("");
  const [dim, setDim] = useState("");

  useEffect(() => {
    setNamn(line?.name ?? "");
    setDim(line?.dimension ?? "");
  }, [line]);

  const lagre = useMutation({
    mutationFn: async () => {
      if (line) await endreAnnet(line.id, namn.trim(), dim.trim() || null);
    },
    onSuccess: () => {
      etter();
      toast({ title: "Navnet er endret", description: pipeLabel(namn.trim(), dim.trim() || null) });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Navnet ble ikke endret", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={line !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {line ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (namn.trim()) lagre.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Endre navn</DialogTitle>
              <DialogDescription>
                Forslaget under Forslag får samme navn, så «Opprett vare» blir riktig utfylt.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="annet-namn">Hva er det?</Label>
              <Input id="annet-namn" className="h-11" maxLength={120} value={namn} onChange={(e) => setNamn(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="annet-dim">Dimensjon</Label>
              <Input id="annet-dim" className="h-11" maxLength={60} value={dim} onChange={(e) => setDim(e.target.value)} placeholder="Valgfritt" />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={onClose}>
                Avbryt
              </Button>
              <Button type="submit" disabled={!namn.trim() || lagre.isPending}>
                {lagre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Lagre navn
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Anna vare                                                          */
/* ------------------------------------------------------------------ */

const MAKS_TREFF = 40;

export function ByttVareDialog({
  line,
  lagerTrekt,
  onClose,
}: {
  line: RettLinje | null;
  /** Har ordren trekt lageret? Eit uttak alltid, ei bestilling når ho er godkjend. */
  lagerTrekt: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const etter = useEtterRetting();
  const varer = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes, enabled: !!line });
  const [søk, setSøk] = useState("");
  const [valgt, setValgt] = useState<PipeType | null>(null);

  useEffect(() => {
    setSøk(line?.is_annet ? line.name : "");
    setValgt(null);
  }, [line]);

  const treff = useMemo(() => {
    const alle = (varer.data ?? []).filter((t) => t.id !== line?.pipe_type_id || line?.is_annet);
    // Aktive først: ei avslått vare er lov, men sjeldan det kontoret meiner
    const funne = (søk.trim() ? alle.filter((t) => matchesSearch(t, søk)) : alle).sort(
      (a, b) => Number(b.active) - Number(a.active),
    );
    return funne;
  }, [varer.data, søk, line]);

  const lagre = useMutation({
    mutationFn: async () => {
      if (line && valgt) await byttVare(line.id, valgt.id);
    },
    onSuccess: () => {
      etter();
      toast({ title: "Varen er byttet", description: valgt ? pipeLabel(valgt.name, valgt.dimension) : undefined });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Varen ble ikke byttet", description: e.message, variant: "destructive" }),
  });

  const annaEining = valgt && line && valgt.unit !== line.unit;

  return (
    <Dialog open={line !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {line ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Bytt vare</DialogTitle>
              <DialogDescription className="break-words">
                {pipeLabel(line.name, line.dimension)} · {qtyLabel(line.quantity, line.unit)}
              </DialogDescription>
            </DialogHeader>

            {valgt ? (
              <div className="space-y-3">
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-3">
                  <p className="font-semibold text-foreground break-words">{pipeLabel(valgt.name, valgt.dimension)}</p>
                  <p className="text-sm text-muted-foreground tabular">
                    {valgt.sku ? `${valgt.sku} · ` : ""}
                    {valgt.price === null ? "uten pris" : `${kr(valgt.price)} kr/${valgt.unit}`} · {num(valgt.stock)} {valgt.unit} på lager
                  </p>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Mengden står: {num(line.quantity)} {valgt.unit}.</li>
                  {lagerTrekt ? (
                    <li>
                      {line.pipe_type_id && !line.is_annet ? `${pipeLabel(line.name, line.dimension)} legges tilbake på lageret, og ` : ""}
                      {pipeLabel(valgt.name, valgt.dimension)} trekkes. Begge står i lagerloggen.
                    </li>
                  ) : (
                    <li>Lageret trekkes når bestillingen godkjennes.</li>
                  )}
                  {line.is_annet ? <li>Forslaget merkes som løst og knyttes til varen.</li> : null}
                </ul>
                {annaEining ? (
                  <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Linjen var i {line.unit}, varen selges i {valgt.unit}. Sjekk at {num(line.quantity)} {valgt.unit} stemmer.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    className="h-11 pl-9"
                    placeholder="Søk på navn, dimensjon eller varenummer"
                    aria-label="Søk etter vare"
                    value={søk}
                    onChange={(e) => setSøk(e.target.value)}
                    autoFocus
                  />
                </div>
                {varer.isLoading ? (
                  <Skeleton className="h-48 w-full rounded-lg" />
                ) : treff.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    Ingen varer passer. Finnes den ikke, opprett den under Lager eller fra Forslag.
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                    {treff.slice(0, MAKS_TREFF).map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setValgt(t)}
                          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {pipeLabel(t.name, t.dimension)}
                              {!t.active ? <span className="text-muted-foreground"> · avslått</span> : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {t.sku ?? "–"} · {t.category_name ?? "Uten kategori"}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular">
                            {t.price === null ? "–" : `${kr(t.price)} kr/${t.unit}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {treff.length > MAKS_TREFF ? (
                  <p className="text-xs text-muted-foreground">Viser {MAKS_TREFF} av {treff.length}. Søk for å finne resten.</p>
                ) : null}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {valgt ? (
                <Button type="button" variant="ghost" onClick={() => setValgt(null)}>
                  Velg en annen
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Avbryt
                </Button>
              )}
              <Button type="button" disabled={!valgt || lagre.isPending} onClick={() => lagre.mutate()}>
                {lagre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Bytt vare
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
