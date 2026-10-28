// Tripletex-linja under eit grunnlag i Faktura-fana: statusen, og det kontoret
// kan gjere med han. Kva knappane er, kjem av statusordet (visTripletex), aldri av
// ei setning.

import { useState } from "react";
import { Building2, CheckCircle2, Loader2, Paperclip, Send, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PipeTripletexKoRow } from "@/integrations/supabase/types";
import { visTripletex } from "@/lib/tripletex";

const TONE = {
  ok: "text-success-ink",
  vent: "text-muted-foreground",
  advar: "text-warning-ink",
  feil: "text-destructive-ink",
} as const;

type Props = {
  ko: PipeTripletexKoRow;
  grunnlagNr: number;
  opptatt: boolean;
  onSend: (a: { kundenr?: number; intern?: boolean }) => void;
  onLeggVed: (overta: boolean) => void;
  onKontrollert: (fant: boolean) => void;
};

export function TripletexRad({ ko, grunnlagNr, opptatt, onSend, onLeggVed, onKontrollert }: Props) {
  const v = visTripletex(ko);
  const [kundenr, setKundenr] = useState("");
  const tal = /^\d{1,9}$/.test(kundenr.trim()) ? Number(kundenr.trim()) : null;
  const Ikon = v.tone === "ok" ? CheckCircle2 : v.tone === "vent" ? Send : TriangleAlert;

  return (
    <div className="w-full basis-full space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${TONE[v.tone]}`}>
        <Ikon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {v.tekst}
        {ko.intern ? <span className="font-normal text-muted-foreground">· internt, felleskontoen</span> : null}
        {ko.tripletex_ordre_id && v.harOrdre ? (
          <span className="font-normal text-muted-foreground tabular">· id {ko.tripletex_ordre_id}</span>
        ) : null}
      </p>

      {ko.siste_feil && (v.kanSende || v.maKontrollere) ? <p className="text-xs text-muted-foreground">{ko.siste_feil}</p> : null}

      {v.kanSende ? (
        <div className="flex flex-wrap items-center gap-2">
          {ko.status === "mangler_kunde" ? (
            <Input
              className="h-9 w-40"
              inputMode="numeric"
              placeholder="Kundenr. i Tripletex"
              aria-label={`Kundenummer i Tripletex for grunnlag ${grunnlagNr}`}
              value={kundenr}
              onChange={(e) => setKundenr(e.target.value)}
            />
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={opptatt || (ko.status === "mangler_kunde" && kundenr.trim() !== "" && tal === null)}
            onClick={() => onSend(tal ? { kundenr: tal } : {})}
          >
            {opptatt ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            Send til Tripletex
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-9" disabled={opptatt}>
                <Building2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Internt – felleskonto
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sende grunnlag nr. {grunnlagNr} som internt?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ordren havner på felleskontoen i Tripletex, ikke på en kunde. Bruk dette for uttak til egne jobber.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction onClick={() => onSend({ intern: true })}>Send som internt</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}

      {v.maKontrollere ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Se etter grunnlag nr. {grunnlagNr} blant ordrene i Tripletex, og si hva du fant. Appen sender ingenting før du har svart.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-9" disabled={opptatt} onClick={() => onKontrollert(true)}>
              Ordren finnes
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9" disabled={opptatt}>
                  Fant den ikke
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Fant du ingen ordre for grunnlag nr. {grunnlagNr}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Da kan grunnlaget sendes på nytt. Finnes ordren likevel, blir kunden fakturert to ganger.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onKontrollert(false)}>Fant ingen ordre</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : null}

      {v.vedlegg ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            {v.vedlegg.tekst}
          </p>
          {ko.vedlegg_feil && v.vedlegg.knapp ? <p className="basis-full text-xs text-muted-foreground">{ko.vedlegg_feil}</p> : null}
          {v.vedlegg.knapp === "legg_ved" ? (
            <Button size="sm" variant="outline" className="h-8" disabled={opptatt} onClick={() => onLeggVed(false)}>
              Legg ved PDF
            </Button>
          ) : null}
          {v.vedlegg.knapp === "legg_ved_likevel" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8" disabled={opptatt}>
                  Legg ved likevel …
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Legge ved PDF-en på nytt?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Det forrige forsøket kan ha kommet fram. Se på ordren i Tripletex først: ligger PDF-en der, blir den
                    liggende to ganger.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Avbryt</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onLeggVed(true)}>Legg ved likevel</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
