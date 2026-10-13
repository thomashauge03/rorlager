// Inventur: hylle for hylle, i hylleorden. Tast eller skann, sjå avvika, lagre
// alt på ein gong. Teljinga ligg som utkast på eininga til ho er lagra.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Scanner } from "@/components/Scanner";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { kr, num, parseNum, pipeLabel } from "@/lib/format";
import { QK, finnSlugForEan } from "@/lib/orders";
import { finnVare } from "@/lib/scanner";
import { matchesSearch } from "@/lib/stock";
import { avvik, iHylleorden, lesUtkast, skrivUtkast, slettUtkast } from "@/lib/inventur";
import type { PipeType } from "@/lib/types";

export function InventurPanel({ varer, visKostpris, onClose }: { varer: PipeType[]; visKostpris: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verdiar, setVerdiar] = useState<Record<string, string>>(lesUtkast);
  const [søk, setSøk] = useState("");
  const [berreUtelte, setBerreUtelte] = useState(false);
  const [skann, setSkann] = useState(false);
  const [stadfest, setStadfest] = useState(false);
  const [merknad, setMerknad] = useState("");
  const felt = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => skrivUtkast(verdiar), [verdiar]);

  const aktive = useMemo(() => iHylleorden(varer.filter((v) => v.active)), [varer]);
  const telt = useMemo(() => {
    const ut: Record<string, number> = {};
    for (const [id, v] of Object.entries(verdiar)) {
      const n = parseNum(v);
      if (n !== null && n >= 0 && aktive.some((a) => a.id === id)) ut[id] = n;
    }
    return ut;
  }, [verdiar, aktive]);
  const avvika = useMemo(() => avvik(aktive, telt), [aktive, telt]);
  const viste = aktive.filter((v) => matchesSearch(v, søk) && (!berreUtelte || !(v.id in telt)));
  const antalTelt = Object.keys(telt).length;
  const sumVerdi = avvika.reduce((s, a) => s + (a.verdi ?? 0), 0);

  const hoppTil = (v: PipeType) => {
    setSøk("");
    setBerreUtelte(false);
    // Etter at lista er teikna på nytt utan filter
    setTimeout(() => {
      const el = felt.current[v.id];
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    }, 50);
  };

  const onKode = (kode: string): string | null => {
    const v = finnVare(kode, aktive);
    if (v) {
      setSkann(false);
      hoppTil(v);
      return null;
    }
    if (/^\d{8,14}$/.test(kode.replace(/\s/g, ""))) {
      setSkann(false);
      void finnSlugForEan(kode).then((slug) => {
        const funnen = slug ? aktive.find((a) => a.qr_slug === slug) : undefined;
        if (funnen) hoppTil(funnen);
        else toast({ title: `Fant ingen vare med strekkoden ${kode}`, variant: "destructive" });
      });
      return null;
    }
    return `Fant ingen vare med koden ${kode}.`;
  };

  const lagre = useMutation({
    mutationFn: async () => {
      const linjer = Object.entries(telt).map(([pipe_type_id, n]) => ({ pipe_type_id, telt: n }));
      const { data, error } = await supabase.rpc("pipe_inventur", { p_linjer: linjer, p_merknad: merknad.trim() || null });
      if (error) throw new Error(error.message || "Inventuren ble ikke lagret");
      return data as unknown as { telde: number; avvik: number };
    },
    onSuccess: (r) => {
      slettUtkast();
      setVerdiar({});
      setStadfest(false);
      queryClient.invalidateQueries({ queryKey: QK.types });
      queryClient.invalidateQueries({ queryKey: QK.stockLog });
      toast({ title: "Inventuren er lagret", description: `${r.telde} varer telt, ${r.avvik} med avvik.` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Inventuren ble ikke lagret", description: e.message, variant: "destructive" }),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <div className="space-y-3 border-b border-border p-4">
          <SheetHeader className="text-left">
            <SheetTitle>Inventur</SheetTitle>
            <SheetDescription>
              Tell hylle for hylle. Tomt felt = ikke telt, og varen blir ikke rørt. Tellingen lagres på denne enheten til
              du lagrer den.
            </SheetDescription>
          </SheetHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                className="h-11 pl-9"
                placeholder="Søk vare eller hylle"
                aria-label="Søk vare eller hylle"
                value={søk}
                onChange={(e) => setSøk(e.target.value)}
              />
            </div>
            <Button variant="outline" className="h-11 shrink-0" onClick={() => setSkann(true)} aria-label="Skann kode">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground tabular">
              {antalTelt} av {aktive.length} telt · {avvika.length} avvik
            </span>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={berreUtelte} onCheckedChange={setBerreUtelte} />
              Bare ikke telt
            </label>
          </div>
        </div>

        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {viste.map((v) => {
            const n = telt[v.id];
            const diff = n === undefined ? null : Math.round((n - Number(v.stock)) * 100) / 100;
            return (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`telt-${v.id}`} className="block break-words text-sm font-medium text-foreground">
                    {pipeLabel(v.name, v.dimension)}
                  </Label>
                  <p className="text-xs text-muted-foreground tabular">
                    {v.location ? `Hylle ${v.location} · ` : ""}registrert {num(v.stock)} {v.unit}
                    {diff !== null && diff !== 0 ? (
                      <span className={diff < 0 ? "text-destructive-ink" : "text-success-ink"}>
                        {" "}
                        · {diff > 0 ? "+" : ""}
                        {num(diff)}
                      </span>
                    ) : diff === 0 ? (
                      <span className="text-success-ink"> · stemmer</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex w-28 shrink-0 items-center gap-1">
                  <Input
                    id={`telt-${v.id}`}
                    ref={(el) => (felt.current[v.id] = el)}
                    className="h-11 text-right tabular"
                    inputMode="decimal"
                    placeholder="–"
                    value={verdiar[v.id] ?? ""}
                    onChange={(e) => setVerdiar((m) => ({ ...m, [v.id]: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground">{v.unit}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="space-y-2 border-t border-border p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <Button className="h-12 w-full text-base" disabled={antalTelt === 0} onClick={() => setStadfest(true)}>
            Se avvik og lagre ({antalTelt} telt)
          </Button>
          {antalTelt > 0 ? (
            <Button
              variant="ghost"
              className="h-11 w-full text-muted-foreground"
              onClick={() => {
                if (window.confirm("Forkaste tellingen? Det du har tastet inn, blir borte.")) {
                  setVerdiar({});
                  slettUtkast();
                }
              }}
            >
              Forkast tellingen
            </Button>
          ) : null}
        </div>

        <Scanner open={skann} onOpenChange={setSkann} title="Skann varen" description="QR-koden på hylla eller strekkoden på varen." onCode={onKode} />

        <AlertDialog open={stadfest} onOpenChange={setStadfest}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lagre inventuren?</AlertDialogTitle>
              <AlertDialogDescription>
                {antalTelt} varer er telt. {avvika.length === 0 ? "Alt stemmer med det som er registrert." : `${avvika.length} har avvik, og beholdningen settes til det som er telt.`}
                {visKostpris && avvika.length > 0 ? ` Samlet ${sumVerdi >= 0 ? "pluss" : "minus"} ${kr(Math.abs(sumVerdi))} kr i innkjøpsverdi.` : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {avvika.length > 0 ? (
              <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
                {avvika.map((a) => (
                  <li key={a.vare.id} className="flex justify-between gap-3 px-3 py-1.5">
                    <span className="min-w-0 break-words">{pipeLabel(a.vare.name, a.vare.dimension)}</span>
                    <span className={`shrink-0 tabular ${a.diff < 0 ? "text-destructive-ink" : "text-success-ink"}`}>
                      {a.diff > 0 ? "+" : ""}
                      {num(a.diff)} {a.vare.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="inventur-merknad">Merknad i lagerloggen</Label>
              <Input
                id="inventur-merknad"
                className="h-11"
                maxLength={300}
                placeholder="Valgfritt, f.eks. «Årsinventur»"
                value={merknad}
                onChange={(e) => setMerknad(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Fortsett å telle</AlertDialogCancel>
              <AlertDialogAction
                className="h-11"
                disabled={lagre.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  lagre.mutate();
                }}
              >
                {lagre.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Lagre inventuren
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
