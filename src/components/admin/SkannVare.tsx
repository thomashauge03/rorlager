// Skann éi vare frå Lager-fana: sjå kor mange som ligg der, tel opp og gå
// rett vidare til neste. Inventuren tel heile lageret i éi økt; dette er for
// den eine kassen ein står framfor – eller for å telje kasse for kasse med
// kameraet utan å leite i lista.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Scanner } from "@/components/Scanner";
import { StockBadge } from "@/components/StatusBadge";
import { QuantityInput } from "@/components/QuantityInput";
import { useToast } from "@/hooks/use-toast";
import { num, pipeLabel, qtyLabel } from "@/lib/format";
import { QK, finnSlugForEan, setStock } from "@/lib/orders";
import { finnVare } from "@/lib/scanner";
import { stockStatus } from "@/lib/stock";
import type { PipeType } from "@/lib/types";

/** Står i lagerloggen, så ein ser kva som er telt med kameraet og kva som er justert for hand */
const NOTAT = "Telt med skanner";

export function SkannVare({
  varer,
  onClose,
  onJuster,
}: {
  /** Alle varene, også inaktive: ein kasse på hylla skal kunne teljast sjølv om varen er slått av */
  varer: PipeType[];
  onClose: () => void;
  /** Vanleg påfyll eller uttak — opnar justeringa i Lager-fana */
  onJuster: (vare: PipeType, mode: "add" | "remove") => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [skann, setSkann] = useState(true);
  const [vareId, setVareId] = useState<string | null>(null);
  const [telt, setTelt] = useState<number | null>(null);

  // Slått opp på nytt kvar teikning, så beholdninga er den ferske etter lagring
  const vare = vareId ? varer.find((v) => v.id === vareId) ?? null : null;

  const vis = (v: PipeType) => {
    setVareId(v.id);
    setTelt(Number(v.stock));
    setSkann(false);
  };

  const onKode = (kode: string): string | null => {
    const v = finnVare(kode, varer);
    if (v) {
      vis(v);
      return null;
    }
    // Strekkoden på sjølve varen: slått opp i basen, der EAN-ane ligg
    if (/^\d{8,14}$/.test(kode.replace(/\s/g, ""))) {
      setSkann(false);
      void finnSlugForEan(kode).then((slug) => {
        const funnen = slug ? varer.find((a) => a.qr_slug === slug) : undefined;
        if (funnen) vis(funnen);
        else {
          toast({ title: `Fant ingen vare med strekkoden ${kode}`, variant: "destructive" });
          setSkann(true);
        }
      });
      return null;
    }
    return `Fant ingen vare med koden ${kode}.`;
  };

  const lagre = useMutation({
    mutationFn: async (vidare: boolean) => {
      if (!vare) throw new Error("Ingen vare er skannet.");
      if (telt === null || telt < 0) throw new Error(`Skriv inn hvor mange ${vare.unit} som ligger på hylla.`);
      const ny = await setStock(vare.id, telt, NOTAT);
      return { ny, vidare, vare };
    },
    onSuccess: ({ ny, vidare, vare: v }) => {
      queryClient.invalidateQueries({ queryKey: QK.types });
      queryClient.invalidateQueries({ queryKey: QK.stockLog });
      const før = Number(v.stock);
      const diff = Math.round((ny - før) * 100) / 100;
      toast({
        title: diff === 0 ? "Stemmer" : `Ny beholdning: ${qtyLabel(ny, v.unit)}`,
        description: `${pipeLabel(v.name, v.dimension)}${diff === 0 ? ` · ${qtyLabel(ny, v.unit)}` : ` · ${diff > 0 ? "+" : ""}${num(diff)} ${v.unit}`}`,
      });
      setVareId(null);
      if (vidare) setSkann(true);
      else onClose();
    },
    onError: (e: Error) => toast({ title: "Beholdningen ble ikke endret", description: e.message, variant: "destructive" }),
  });

  const lukkScanner = (open: boolean) => {
    setSkann(open);
    // Lukka utan å finne noko: tilbake til Lager-fana
    if (!open && !vareId) onClose();
  };

  const diff = vare && telt !== null ? Math.round((telt - Number(vare.stock)) * 100) / 100 : 0;

  return (
    <>
      <Scanner
        open={skann}
        onOpenChange={lukkScanner}
        title="Skann vare"
        description="QR-koden på hylla eller strekkoden på varen. Du ser hvor mange som er på lager, og kan telle opp."
        onCode={onKode}
      />

      {vare ? (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="break-words pr-6">{pipeLabel(vare.name, vare.dimension)}</DialogTitle>
              <DialogDescription>
                {[vare.location ? `Hylle ${vare.location}` : null, vare.sku ? `Varenr. ${vare.sku}` : null, vare.active ? null : "Inaktiv"]
                  .filter(Boolean)
                  .join(" · ") || "Ingen hylle registrert"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-end justify-between gap-3 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm text-muted-foreground">På lager nå</p>
                  <p className="tabular text-4xl font-semibold leading-tight text-foreground">
                    {num(Number(vare.stock))} <span className="text-lg font-normal text-muted-foreground">{vare.unit}</span>
                  </p>
                </div>
                <StockBadge status={stockStatus(vare)} />
              </div>

              <div className="space-y-1.5">
                <Label id="skann-telt">Talt antall</Label>
                <QuantityInput value={telt} onChange={setTelt} unit={vare.unit} labelledBy="skann-telt" autoFocus />
                <p className="tabular text-sm text-muted-foreground">
                  {telt === null
                    ? "Skriv inn hvor mange som ligger på hylla."
                    : diff === 0
                      ? "Stemmer med det som er registrert."
                      : `${diff > 0 ? "+" : ""}${num(diff)} ${vare.unit} mot det som er registrert.`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" onClick={() => onJuster(vare, "add")}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Legg til
                </Button>
                <Button variant="outline" className="h-11" onClick={() => onJuster(vare, "remove")}>
                  <Minus className="h-4 w-4" aria-hidden="true" />
                  Ta ut
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" className="h-12" disabled={lagre.isPending} onClick={() => lagre.mutate(false)}>
                Lagre og lukk
              </Button>
              <Button className="h-12" disabled={lagre.isPending} onClick={() => lagre.mutate(true)}>
                {lagre.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanLine className="h-4 w-4" aria-hidden="true" />}
                Lagre og skann neste
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
