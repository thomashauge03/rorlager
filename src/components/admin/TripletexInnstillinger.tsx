// Innstillingane for Tripletex: bryteren (fra_dato), produktet ordrelinja
// står på, felleskontoen for interne uttak, forfallet – og kundekoplingane
// kontoret har gjort. Berre superadmin kan endre innstillingane; RLS held det.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { shortDate } from "@/lib/format";
import {
  QK_TRIPLETEX,
  fetchTripletexInnstilling,
  fetchTripletexKunder,
  fjernTripletexKunde,
  lagreTripletexInnstilling,
} from "@/lib/tripletex";

/** «prosjekt:…» og «jobb:…» er interne nøklar. Det kontoret kjenner att, er resten */
const visNokkel = (n: string) => n.replace(/^(privat|jobb|prosjekt):/, "").replace(/\|/g, ", ");

export function TripletexInnstillinger({ kanEndre }: { kanEndre: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const innstilling = useQuery({ queryKey: QK_TRIPLETEX.innstilling, queryFn: fetchTripletexInnstilling, retry: false });
  const kunder = useQuery({ queryKey: QK_TRIPLETEX.kunder, queryFn: fetchTripletexKunder, retry: false });

  const [fra, setFra] = useState("");
  const [produkt, setProdukt] = useState("");
  const [felles, setFelles] = useState("");
  const [forfall, setForfall] = useState("14");

  useEffect(() => {
    const s = innstilling.data;
    if (!s) return;
    setFra(s.fra_dato ?? "");
    setProdukt(s.produkt_nr ?? "");
    setFelles(s.felleskunde_nr ? String(s.felleskunde_nr) : "");
    setForfall(String(s.forfall_dagar ?? 14));
  }, [innstilling.data]);

  const lagre = useMutation({
    mutationFn: async (paa: { fra_dato: string | null }) => {
      const fellesNr = felles.trim() === "" ? null : Number(felles.trim());
      if (fellesNr !== null && !(Number.isSafeInteger(fellesNr) && fellesNr > 0)) throw new Error("Felleskontoen må være et kundenummer (bare siffer).");
      const dagar = Number(forfall.trim());
      if (!Number.isSafeInteger(dagar) || dagar < 0 || dagar > 365) throw new Error("Forfall må være mellom 0 og 365 dager.");
      if (paa.fra_dato && !produkt.trim()) throw new Error("Fyll inn produktnummeret før Tripletex slås på.");
      await lagreTripletexInnstilling({
        fra_dato: paa.fra_dato,
        produkt_nr: produkt.trim() || null,
        felleskunde_nr: fellesNr,
        forfall_dagar: dagar,
      });
    },
    onSuccess: (_d, paa) => {
      toast({
        title: "Tripletex-innstillingene er lagret",
        description: paa.fra_dato
          ? `Grunnlag laget fra og med ${shortDate(paa.fra_dato)} blir ordre i Tripletex.`
          : "Tripletex er av. Ingenting blir sendt.",
      });
      qc.invalidateQueries({ queryKey: QK_TRIPLETEX.innstilling });
    },
    onError: (e: unknown) =>
      toast({ title: "Ble ikke lagret", description: e instanceof Error ? e.message : "Ukjent feil", variant: "destructive" }),
  });

  const fjern = useMutation({
    mutationFn: fjernTripletexKunde,
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_TRIPLETEX.kunder }),
    onError: (e: unknown) =>
      toast({ title: "Koblingen ble ikke fjernet", description: e instanceof Error ? e.message : "Ukjent feil", variant: "destructive" }),
  });

  // Før migrasjonen finst ikkje tabellen. Då er det ingenting å vise
  if (innstilling.isError || (innstilling.isSuccess && !innstilling.data)) return null;

  const paa = Boolean(innstilling.data?.fra_dato);

  return (
    <Card className="hm-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tripletex</CardTitle>
        <p className="text-sm text-muted-foreground">
          Et nytt fakturagrunnlag blir en ordre i Tripletex med én linje, «Pris ihht vedlegg», og PDF-en som vedlegg.
          PDF-en følger fakturaen når den lages i Tripletex. Appen fakturerer aldri, sender ingenting til kunden og
          sletter ingenting i Tripletex.
        </p>
        <p className={`text-sm font-semibold ${paa ? "text-success-ink" : "text-muted-foreground"}`}>
          {innstilling.isLoading
            ? "Henter …"
            : paa
              ? `På: grunnlag fra og med ${shortDate(innstilling.data!.fra_dato!)} blir sendt.`
              : "Av: ingenting blir sendt."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tt-produkt">Produktnummer for linja</Label>
            <Input id="tt-produkt" className="h-11" disabled={!kanEndre} value={produkt} onChange={(e) => setProdukt(e.target.value)} />
            <p className="text-xs text-muted-foreground">Nummeret produktet har i Tripletex, for eksempel «Salg rør».</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tt-felles">Felleskonto for interne uttak</Label>
            <Input
              id="tt-felles"
              className="h-11 tabular"
              inputMode="numeric"
              disabled={!kanEndre}
              value={felles}
              onChange={(e) => setFelles(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Kundenummeret i Tripletex som «Internt – felleskonto» sender til.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tt-forfall">Forfall (dager)</Label>
            <Input
              id="tt-forfall"
              className="h-11 tabular"
              inputMode="numeric"
              disabled={!kanEndre}
              value={forfall}
              onChange={(e) => setForfall(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tt-fra">Send grunnlag laget fra og med</Label>
            <Input
              id="tt-fra"
              type="date"
              className="h-11 dark:[color-scheme:dark]"
              disabled={!kanEndre}
              value={fra}
              onChange={(e) => setFra(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Tom = av. Eldre grunnlag blir aldri sendt.</p>
          </div>
        </div>

        {kanEndre ? (
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" disabled={lagre.isPending} onClick={() => lagre.mutate({ fra_dato: fra || null })}>
              {lagre.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Lagre
            </Button>
            {paa ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={lagre.isPending}
                onClick={() => {
                  setFra("");
                  lagre.mutate({ fra_dato: null });
                }}
              >
                Slå av Tripletex
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Bare superadmin kan endre Tripletex-innstillingene.</p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kundekoblinger</p>
          <p className="text-xs text-muted-foreground">
            Bedrifter med org.nr. blir funnet i Tripletex av seg selv. Når du skriver inn et kundenummer på et
            grunnlag, blir det husket her, og det går foran org.nr. neste gang.
          </p>
          {(kunder.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen koblinger ennå.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {(kunder.data ?? []).map((k) => (
                <div key={k.kunde_nokkel} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{visNokkel(k.kunde_nokkel)}</span>
                    <span className="block text-xs text-muted-foreground">
                      Kundenr. {k.kundenr}
                      {k.koblet_av ? ` · ${k.koblet_av}` : ""} · {shortDate(k.koblet_at)}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Fjern koblingen for ${visNokkel(k.kunde_nokkel)}`}
                    disabled={fjern.isPending}
                    onClick={() => fjern.mutate(k.kunde_nokkel)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive-ink" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
