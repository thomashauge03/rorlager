// Eit forslag som gjeld ei vare katalogen alt har – skrive annleis, eller
// berre ikkje funne på lageret. Kontoret vel vara, og linja blir gjort om.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VareVelger } from "@/components/admin/RettUttak";
import { useToast } from "@/hooks/use-toast";
import { kr, num, pipeLabel } from "@/lib/format";
import { QK, fetchPipeTypes } from "@/lib/orders";
import { matchesSearch } from "@/lib/stock";
import { kanPrisast, knyttTilVare, type Suggestion } from "@/lib/suggestions";
import type { PipeType } from "@/lib/types";

export function KnyttForslagDialog({ forslag, onClose }: { forslag: Suggestion[] | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const varer = useQuery({ queryKey: QK.types, queryFn: fetchPipeTypes, enabled: !!forslag });
  const [søk, setSøk] = useState("");
  const [valgt, setValgt] = useState<PipeType | null>(null);

  const første = forslag?.[0] ?? null;

  useEffect(() => {
    setSøk(første ? første.name : "");
    setValgt(null);
  }, [første]);

  const treff = useMemo(() => {
    const alle = varer.data ?? [];
    // Aktive først: ei avslått vare er lov, men sjeldan det kontoret meiner
    return (søk.trim() ? alle.filter((t) => matchesSearch(t, søk)) : alle).sort(
      (a, b) => Number(b.active) - Number(a.active),
    );
  }, [varer.data, søk]);

  const liste = forslag ?? [];
  const medLinje = liste.filter(kanPrisast).length;
  const utanLinje = liste.length - medLinje;
  const annaEining = valgt ? liste.some((s) => s.unit !== valgt.unit) : false;
  const sum = liste.reduce((s, f) => s + Number(f.quantity), 0);

  const lagre = useMutation({
    mutationFn: () => knyttTilVare(liste, (valgt as PipeType).id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.suggestions });
      queryClient.invalidateQueries({ queryKey: QK.orders });
      queryClient.invalidateQueries({ queryKey: QK.types });
      toast({
        title: liste.length === 1 ? "Forslaget er knyttet til varen" : `${liste.length} forslag er knyttet til varen`,
        description: valgt ? pipeLabel(valgt.name, valgt.dimension) : undefined,
      });
      onClose();
    },
    onError: (e: Error) => {
      // Ein del kan vere lagra før feilen; lista skal vise det som faktisk står
      queryClient.invalidateQueries({ queryKey: QK.suggestions });
      toast({ title: "Forslaget ble ikke knyttet", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={forslag !== null} onOpenChange={(o) => !o && !lagre.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {første ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Knytt til eksisterende vare</DialogTitle>
              <DialogDescription className="break-words">
                {pipeLabel(første.name, første.dimension)} · {num(sum)} {første.unit}
                {liste.length > 1 ? ` fra ${liste.length} forslag` : ""}
              </DialogDescription>
            </DialogHeader>

            {valgt ? (
              <div className="space-y-3">
                <div className="rounded-lg border-2 border-primary bg-primary/5 p-3">
                  <p className="break-words font-semibold text-foreground">{pipeLabel(valgt.name, valgt.dimension)}</p>
                  <p className="tabular text-sm text-muted-foreground">
                    {valgt.sku ? `${valgt.sku} · ` : ""}
                    {valgt.price === null ? "uten pris" : `${kr(valgt.price)} kr/${valgt.unit}`} · {num(valgt.stock)}{" "}
                    {valgt.unit} på lager
                  </p>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {medLinje > 0 ? (
                    <li>
                      {medLinje === 1 ? "Linjen" : `De ${medLinje} linjene`} i uttaket blir byttet til varen, med varens
                      pris{valgt.price === null ? " (varen har ingen pris ennå)" : ""}. Har uttaket trukket lageret,
                      trekkes varen nå og står i lagerloggen.
                    </li>
                  ) : null}
                  {utanLinje > 0 ? (
                    <li>
                      {utanLinje === 1 ? "Ett forslag" : `${utanLinje} forslag`} har en ordre som er slettet eller
                      fakturert. Der blir bare forslaget knyttet til varen – fakturagrunnlaget endres ikke.
                    </li>
                  ) : null}
                  <li>Forslaget merkes som løst og flyttes til Behandlet.</li>
                </ul>
                {annaEining ? (
                  <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-ink">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Forslaget var i {første.unit}, varen selges i {valgt.unit}. Mengden står som den er – sjekk at den
                    stemmer.
                  </p>
                ) : null}
              </div>
            ) : (
              <VareVelger treff={treff} lastar={varer.isLoading} søk={søk} setSøk={setSøk} onVelg={setValgt} />
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {valgt ? (
                <Button type="button" variant="ghost" onClick={() => setValgt(null)} disabled={lagre.isPending}>
                  Velg en annen
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Avbryt
                </Button>
              )}
              <Button type="button" disabled={!valgt || lagre.isPending} onClick={() => lagre.mutate()}>
                {lagre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Knytt til varen
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
