import { useEffect, useId, useState } from "react";
import { PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuantityInput } from "@/components/QuantityInput";
import { cn } from "@/lib/utils";
import { ANNET_GRENSER, ANNET_TEKST, TOMT_ANNET, sjekkAnnet, type AnnetEining, type AnnetSkjema } from "@/lib/annet";

/** Det vesle merket som står framfor namnet på ei annet-linje. */
export function AnnetMerke() {
  return (
    <span className="mr-1.5 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {ANNET_TEKST.merke}
    </span>
  );
}

/**
 * Brikka øvst, sist i rekkja med kategoriar.
 *
 * Knappen under lista var for godt gøymd: med 150 rør står han tjue skjermar
 * ned, og den som ikkje finn det han leitar etter, gir opp lenge før det. Her
 * står han på første skjerm – men i same form som kategoriane, med stipla kant
 * og dempa farge, så han ikkje konkurrerer med «Skann QR-kode» og søket.
 */
export function AnnetBrikke({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Legg til annet: noe som ikke står i lista"
      className="inline-flex h-11 items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/50 px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      {/* «Legg til», ikkje berre «Annet»: midt mellom kategoriane ville
          «Annet» blitt lese som ein kategori som heiter det. */}
      Legg til annet
    </button>
  );
}

/** Knappen som opnar skjemaet. Står under lista og i tomt søk. */
export function AnnetKnapp({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    // Teksten får bryte: på ein 320 px-telefon er han breiare enn knappen, og
    // med nowrap frå Button blei heile sida 18 px for brei og kunne zoomast ut.
    <Button
      type="button"
      variant="outline"
      className={cn("h-auto min-h-12 w-full whitespace-normal py-2 text-base leading-snug [&_svg]:size-5", className)}
      onClick={onClick}
    >
      <PackagePlus aria-hidden="true" />
      Finner du ikke det du skal ha? Legg til annet
    </Button>
  );
}

/**
 * Skjemaet for noko katalogen manglar. Delt av uttaket og bestillinga; `slag`
 * avgjer berre kva kunden får vite om prisen.
 */
export function AnnetDialog({
  open,
  onOpenChange,
  slag,
  forslag,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slag: "uttak" | "bestilling";
  /** Fyller inn feltet når skjemaet opnar – søkjeteksten, eller ein ukjend kode. */
  forslag?: Partial<Pick<AnnetSkjema, "name" | "note">>;
  onAdd: (s: AnnetSkjema) => void;
}) {
  const [s, setS] = useState<AnnetSkjema>(TOMT_ANNET);
  const [feil, setFeil] = useState<string | null>(null);
  const mengdeId = useId();

  // Kvar gong skjemaet opnar, blankt ark med forslaget fylt inn
  useEffect(() => {
    if (open) {
      setS({ ...TOMT_ANNET, ...forslag });
      setFeil(null);
    }
    // forslag er eit nytt objekt kvar render hos kallaren; det er opninga som tel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof AnnetSkjema>(k: K, v: AnnetSkjema[K]) => {
    setS((f) => ({ ...f, [k]: v }));
    setFeil(null);
  };

  const legg = (e: React.FormEvent) => {
    e.preventDefault();
    const f = sjekkAnnet(s);
    if (f) {
      setFeil(f);
      return;
    }
    onAdd(s);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={legg} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Legg til annet</DialogTitle>
            <DialogDescription>
              {slag === "bestilling"
                ? "Skriv hva du trenger. Det blir en forespørsel: du får pris før vi godkjenner bestillingen."
                : "Skriv hva du tar ut. Kontoret setter prisen, og legger varen inn i lista hvis den skal være der."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="annet-navn">Hva er det?</Label>
            <Input
              id="annet-navn"
              className="h-12 text-base"
              placeholder="PE-rør, muffe, kum …"
              autoFocus
              maxLength={ANNET_GRENSER.namn}
              value={s.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={feil === "Skriv hva varen er" || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="annet-dimensjon">
              Dimensjon <span className="font-normal text-muted-foreground">(valgfritt)</span>
            </Label>
            <Input
              id="annet-dimensjon"
              className="h-12 text-base"
              placeholder="40 mm"
              maxLength={ANNET_GRENSER.dimensjon}
              value={s.dimension}
              onChange={(e) => set("dimension", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <p id={mengdeId} className="text-sm font-medium leading-none">
              Hvor mye?
            </p>
            <div role="radiogroup" aria-label="Enhet" className="flex gap-2">
              {(["m", "stk"] as AnnetEining[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={s.unit === u}
                  onClick={() => set("unit", u)}
                  className={cn(
                    "h-11 flex-1 rounded-md border text-sm font-semibold transition-colors",
                    s.unit === u
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {u === "m" ? "Meter" : "Stykk"}
                </button>
              ))}
            </div>
            <QuantityInput value={s.quantity} onChange={(v) => set("quantity", v)} unit={s.unit} labelledBy={mengdeId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="annet-merknad">
              Merknad <span className="font-normal text-muted-foreground">(valgfritt)</span>
            </Label>
            <Textarea
              id="annet-merknad"
              rows={2}
              placeholder="Hvor den lå, merke, farge …"
              maxLength={ANNET_GRENSER.merknad}
              value={s.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          {feil ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {feil}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="h-12" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" className="h-12 text-base">
              Legg i {slag === "bestilling" ? "bestillingen" : "kurven"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
