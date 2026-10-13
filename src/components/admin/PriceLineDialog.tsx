// Pris på éi ordrelinje. Brukt frå forslaga, frå «Pris mangler» i Bestillinger
// og frå hentekøen, der ei bestilling med ein førespurnad ventar på pris før ho
// kan godkjennast.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { kr, num, parseNum, pipeLabel } from "@/lib/format";
import { QK } from "@/lib/orders";
import { priceLine } from "@/lib/suggestions";

export type PrisLinje = {
  id: string;
  name: string;
  dimension: string | null;
  unit: string;
  quantity: number;
  unit_price: number | null;
};

export function PriceLineDialog({
  line,
  onClose,
  onPriced,
}: {
  /** Null held dialogen lukka. */
  line: PrisLinje | null;
  onClose: () => void;
  /** Etter at prisen er lagra, før dialogen lukkar seg. */
  onPriced?: (unitPrice: number) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tekst, setTekst] = useState("");

  useEffect(() => {
    setTekst(line?.unit_price === null || line?.unit_price === undefined ? "" : String(line.unit_price).replace(".", ","));
  }, [line]);

  const pris = parseNum(tekst);
  const gyldig = pris !== null && pris >= 0;

  const lagre = useMutation({
    mutationFn: async () => {
      if (!line || !gyldig) throw new Error("Skriv en gyldig pris");
      await priceLine(line.id, pris);
      await onPriced?.(pris);
    },
    onSuccess: () => {
      // Ordrane, hentekøen og forslaga les alle linja
      queryClient.invalidateQueries({ queryKey: QK.orders });
      queryClient.invalidateQueries({ queryKey: QK.suggestions });
      toast({ title: "Prisen er satt", description: line ? pipeLabel(line.name, line.dimension) : undefined });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Prisen ble ikke satt", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={line !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {line ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lagre.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Sett pris</DialogTitle>
              <DialogDescription className="break-words">
                {pipeLabel(line.name, line.dimension)} · {num(line.quantity)} {line.unit}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="linje-pris">Pris per {line.unit} eks. mva (kr)</Label>
              <Input
                id="linje-pris"
                className="h-11 tabular"
                inputMode="decimal"
                autoFocus
                value={tekst}
                onChange={(e) => setTekst(e.target.value)}
              />
              {gyldig ? (
                <p className="tabular text-sm text-muted-foreground">
                  Linjesum: <span className="font-semibold text-foreground">{kr(Math.round(pris * line.quantity * 100) / 100)} kr</span>
                </p>
              ) : null}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={onClose}>
                Avbryt
              </Button>
              <Button type="submit" disabled={!gyldig || lagre.isPending}>
                {lagre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Lagre pris
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
