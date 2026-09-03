// Mottakskontrollen: forventa mot mottatt, linje for linje.
//
// Dette er skjermen som blir opna med hanskar på medan bilen står og ventar.
// Difor: eitt felt per linje, førehandsfylt med det som står att, store
// trykkflater, og ingenting i vegen for den som berre har fått alt.
//
// Avviket ligg bak eit trykk. På ei leveranse med tolv linjer ville tolv
// nedtrekk vore tolv sjansar til å treffe feil, og elleve av dei ville stått
// på «Ingen avvik» uansett.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Loader2, PackageCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TopBar } from "@/components/TopBar";
import { Stat } from "@/components/Stat";
import { SignaturePad } from "@/components/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { QK } from "@/lib/orders";
import { fetchProjectOrder, submitReceipt, suggestDeviation } from "@/lib/projects";
import { useAuth } from "@/lib/auth";
import { num, parseNum, pipeLabel, shortDate } from "@/lib/format";
import { DEVIATION_LABEL, type Deviation, type ProjectOrderLine } from "@/lib/types";

const NAVN_NØKKEL = "rorlager.prosjekt.navn";

const lesNavn = () => {
  try {
    return localStorage.getItem(NAVN_NØKKEL) ?? "";
  } catch {
    return "";
  }
};

/** Talet slik det skal stå i eit tekstfelt: norsk komma, utan flyttalsstøy. */
const somTekst = (n: number) => String(n).replace(".", ",");

/**
 * Ein uuid, òg utan sikker kontekst.
 *
 * crypto.randomUUID finst berre over HTTPS og på localhost. Blir appen opna
 * over rein http frå ein maskin på nettverket – ikkje utenkjeleg på ein
 * byggjeplass med eit lokalt nett – ville sida krasja i det ho blei teikna.
 * Reserva treng ikkje vere kryptografisk; ho skal berre vere ulik forrige.
 */
function lagNøkkel(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const t = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${t()}${t()}-${t()}-4${t().slice(1)}-a${t().slice(1)}-${t()}${t()}${t()}`;
}

type Rad = { mottattTekst: string; avvik: Deviation; notat: string; avvikOpe: boolean };

const tomRad = (rest: number): Rad => ({ mottattTekst: somTekst(rest), avvik: "ingen", notat: "", avvikOpe: false });

export default function ProjectReceipt() {
  const { id = "", ordreId = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth(() => navigate("/login", { replace: true }));
  const klar = !auth.checking && !!auth.email;

  const order = useQuery({
    queryKey: [...QK.projectOrders, "en", ordreId],
    queryFn: () => fetchProjectOrder(ordreId),
    enabled: klar && !!ordreId,
  });

  const [rader, setRader] = useState<Record<string, Rad>>({});
  const [navn, setNavn] = useState(lesNavn);
  const [signatur, setSignatur] = useState<string | null>(null);
  const [notat, setNotat] = useState("");
  const navnRef = useRef<HTMLInputElement | null>(null);

  /*
   * Nøkkelen for dette forsøket. Laga éin gong per opna skjerm, og den same om
   * brukaren må prøve på nytt. Går skrivinga gjennom men svaret blir borte i
   * dårleg dekning, svarar databasen med det same mottaket i staden for å lage
   * ei pulje nummer to med dei same tala.
   */
  const clientRef = useRef<string>(lagNøkkel());

  // Berre linjer kontoret faktisk tinga, og som ikkje alt er fullt levert.
  const linjer: ProjectOrderLine[] = useMemo(
    () => (order.data?.lines ?? []).filter((l) => Number(l.ordered_qty ?? 0) > 0 && l.remaining_qty > 0),
    [order.data],
  );

  /*
   * Førehandsfyller med det som står att.
   *
   * Nøkkelen er kor mange mottak bestillinga har. Kjem det inn eit mottak
   * registrert av nokon andre medan sida står open – to personar ved porten er
   * ikkje uvanleg – blir felta fylte på nytt med den nye resten. Utan det ville
   * feltet vist gamle tal medan overskrifta over viste dei nye, og innsendinga
   * hadde blitt ei overlevering.
   */
  const mottakTeljar = order.data?.receipts.length ?? 0;
  useEffect(() => {
    if (linjer.length === 0) return;
    setRader(Object.fromEntries(linjer.map((l) => [l.id, tomRad(l.remaining_qty)])));
    // linjer er utleidd av order.data, som mottakTeljar allereie følgjer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mottakTeljar, ordreId]);

  const settRad = (l: ProjectOrderLine, patch: Partial<Rad>) =>
    setRader((f) => ({ ...f, [l.id]: { ...(f[l.id] ?? tomRad(l.remaining_qty)), ...patch } }));

  /**
   * Set antalet.
   *
   * Avviket blir IKKJE gjetta ut frå talet. Ein tidlegare versjon prøvde å
   * rekonstruere om brukaren hadde valt sjølv, ved å samanlikne det gamle
   * avviket med forslaget for det gamle talet – og bomma begge vegar: eit
   * manuelt vald «Ingen avvik» kunne aldri telje som valt, og eit «skadet»
   * blei ståande når talet seinare blei ei overlevering. No er valet brukaren
   * sitt, og databasen tvingar «for mye» når summen krev det.
   */
  const settMottatt = (l: ProjectOrderLine, tekst: string) => settRad(l, { mottattTekst: tekst });

  const rørt = linjer.some((l) => {
    const r = rader[l.id];
    return r && (r.mottattTekst !== somTekst(l.remaining_qty) || r.avvik !== "ingen" || r.notat !== "");
  });

  const nullstill = () => {
    setRader(Object.fromEntries(linjer.map((l) => [l.id, tomRad(l.remaining_qty)])));
    toast({ title: "Alle linjer satt tilbake til bestilt antall" });
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!navn.trim()) {
        navnRef.current?.focus();
        navnRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        throw new Error("Skriv inn navnet ditt. Mottakskontrollen skal vise hvem som kvitterte.");
      }

      const ut = linjer
        .map((l) => {
          const rad = rader[l.id] ?? tomRad(l.remaining_qty);
          const antal = parseNum(rad.mottattTekst);
          if (antal === null) throw new Error(`Fyll inn hvor mye som kom av «${l.name}».`);
          if (antal < 0) throw new Error("Mottatt antall kan ikke være negativt.");
          return {
            order_line_id: l.id,
            received_qty: antal,
            deviation: rad.avvik === "ingen" ? suggestDeviation(antal, l.remaining_qty) : rad.avvik,
            note: rad.notat.trim() || null,
          };
        })
        // Linjer det ikkje kom noko på og som ikkje har eit avvik, er ikkje
        // informasjon. Databasen hoppar over dei uansett.
        .filter((r) => r.received_qty > 0 || r.deviation !== "ingen");

      if (ut.length === 0) throw new Error("Ingen linjer å kvittere for. Fyll inn hva som kom.");

      try {
        localStorage.setItem(NAVN_NØKKEL, navn.trim());
      } catch {
        /* ignorer – berre ei bekvemmelegheit */
      }

      return submitReceipt({
        orderId: ordreId,
        receivedByName: navn,
        signature: signatur,
        note: notat.trim() || null,
        clientRef: clientRef.current,
        lines: ut,
      });
    },
    onSuccess: (kvittering) => {
      queryClient.invalidateQueries({ queryKey: QK.projectOrders });
      toast({
        title: "Mottaket er registrert",
        description: `Mottak #${kvittering.receipt_number} er lagret på bestillingen.`,
      });
      navigate(`/prosjekt/${id}`, { replace: true });
    },
    onError: (error: Error) =>
      toast({ variant: "destructive", title: "Mottaket ble ikke registrert", description: error.message }),
  });

  if (auth.checking || order.isLoading) {
    return (
      <div className="hm-page min-h-dvh">
        <TopBar title="Mottakskontroll" back={`/prosjekt/${id}`} />
        <main className="mx-auto w-full max-w-2xl px-3 pt-4 sm:px-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <span className="sr-only">Henter bestillingen</span>
        </main>
      </div>
    );
  }

  const o = order.data;

  if (order.isError || !o) {
    return (
      <div className="hm-page min-h-dvh">
        <TopBar title="Mottakskontroll" back={`/prosjekt/${id}`} />
        <main className="mx-auto w-full max-w-2xl px-3 pt-4 sm:px-4">
          <div className="hm-card p-6">
            <p className="font-semibold text-foreground">Fant ikke bestillingen</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sjekk at du har dekning, og prøv igjen. Er den nettopp slettet, finnes den ikke lenger.
            </p>
            {order.error instanceof Error ? (
              <p className="mt-2 text-xs text-muted-foreground">{order.error.message}</p>
            ) : null}
            <Button variant="outline" className="mt-3 h-12 w-full" onClick={() => order.refetch()}>
              Prøv igjen
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (linjer.length === 0) {
    return (
      <div className="hm-page min-h-dvh">
        <TopBar title="Mottakskontroll" subtitle={`Bestilling #${o.order_number}`} back={`/prosjekt/${id}`} />
        <main className="mx-auto w-full max-w-2xl px-3 pt-4 sm:px-4">
          <div className="hm-card flex flex-col items-center justify-center gap-2 py-14 text-center">
            <div className="rounded-full bg-success/10 p-4 ring-8 ring-success/5">
              <CheckCheck className="h-7 w-7 text-success" aria-hidden="true" />
            </div>
            <p className="mt-1 font-semibold text-foreground">Alt er mottatt</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Det står ingenting igjen å kvittere for på denne bestillingen.
            </p>
            <Button variant="outline" className="mt-2 h-12" onClick={() => navigate(`/prosjekt/${id}`)}>
              Tilbake til prosjektet
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-dvh flex flex-col">
      <TopBar title="Mottakskontroll" subtitle={`Bestilling #${o.order_number}`} back={`/prosjekt/${id}`} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-3 pb-6 pt-4 sm:px-4">
        <div className="hm-card p-3">
          <div className="flex flex-wrap gap-2">
            {o.supplier ? <Stat label="Leverandør" value={o.supplier} /> : null}
            {o.supplier_ref ? <Stat label="Ordrenr." value={o.supplier_ref} /> : null}
            {o.expected_at ? <Stat label="Ventet" value={shortDate(o.expected_at)} /> : null}
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            Feltene er fylt ut med det som skal komme. Stemmer alt, trenger du bare skrive navnet ditt og kvittere.
          </p>

          {rørt ? (
            <Button variant="outline" className="mt-3 h-12 w-full [&_svg]:size-5" onClick={nullstill}>
              <RotateCcw className="mr-2" aria-hidden="true" />
              Sett alt tilbake til bestilt antall
            </Button>
          ) : null}
        </div>

        {/* Navnet står ØVERST. Det er påkrevd, og på ei leveranse med tolv
            linjer ville det elles ligge langt nede medan sjåføren ventar. */}
        <div className="hm-card mt-4 space-y-1.5 p-3">
          <Label htmlFor="mottak-navn">
            Ditt navn <span className="text-destructive">*</span>
          </Label>
          <Input
            id="mottak-navn"
            ref={navnRef}
            value={navn}
            onChange={(e) => setNavn(e.target.value)}
            autoComplete="name"
            aria-invalid={send.isError && !navn.trim()}
            className="h-12 text-base"
          />
        </div>

        <ul className="mt-4 space-y-3">
          {linjer.map((l) => {
            const rad = rader[l.id] ?? tomRad(l.remaining_qty);
            const antal = parseNum(rad.mottattTekst);
            const forMykje = antal !== null && antal > l.remaining_qty;

            return (
              <li key={l.id} className="hm-card p-4">
                <p className="font-semibold text-foreground">{pipeLabel(l.name, l.dimension)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Skal komme:{" "}
                  <strong className="tabular text-foreground">
                    {num(l.remaining_qty)} {l.unit}
                  </strong>
                  {l.received_qty > 0 ? (
                    <span className="tabular">
                      {" "}
                      · {num(l.received_qty)} {l.unit} mottatt før
                    </span>
                  ) : null}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <Label htmlFor={`mottatt-${l.id}`} className="w-20 shrink-0 text-sm">
                    Kom
                  </Label>
                  <Input
                    id={`mottatt-${l.id}`}
                    value={rad.mottattTekst}
                    onChange={(e) => settMottatt(l, e.target.value)}
                    // Markerer innhaldet: feltet er førehandsfylt, og utan dette
                    // ville «12» pluss eit tastetrykk blitt «128».
                    onFocus={(e) => e.currentTarget.select()}
                    inputMode="decimal"
                    className="tabular h-14 w-28 text-center text-lg font-semibold"
                  />
                  <span className="text-sm text-muted-foreground">{l.unit}</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="tabular ml-auto h-14 w-14 text-base"
                    aria-label={`Ingenting kom av ${l.name}`}
                    onClick={() => settMottatt(l, "0")}
                  >
                    0
                  </Button>
                </div>

                {forMykje ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-warning-ink dark:text-warning">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Mer enn bestilt – blir meldt som avvik
                  </p>
                ) : null}

                {rad.avvikOpe || rad.avvik !== "ingen" ? (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`avvik-${l.id}`} className="text-sm">
                        Hva er galt?
                      </Label>
                      <Select value={rad.avvik} onValueChange={(v) => settRad(l, { avvik: v as Deviation })}>
                        <SelectTrigger id={`avvik-${l.id}`} className="h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(DEVIATION_LABEL) as Deviation[]).map((d) => (
                            <SelectItem key={d} value={d}>
                              {DEVIATION_LABEL[d]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`notat-${l.id}`} className="text-sm">
                        Merknad
                      </Label>
                      <Input
                        id={`notat-${l.id}`}
                        value={rad.notat}
                        onChange={(e) => settRad(l, { notat: e.target.value })}
                        placeholder="F.eks. to rør hadde sprekk"
                        className="h-12 text-base"
                      />
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-11 px-2 text-muted-foreground"
                    onClick={() => settRad(l, { avvikOpe: true })}
                  >
                    <TriangleAlert className="mr-2 h-4 w-4" aria-hidden="true" />
                    Meld avvik på denne
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <section className="hm-card mt-4 space-y-3 p-3" aria-labelledby="kvittering">
          <h2 id="kvittering" className="text-sm font-semibold text-foreground">
            Kvittering
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="mottak-notat">Merknad til hele leveransen</Label>
            <Textarea
              id="mottak-notat"
              value={notat}
              onChange={(e) => setNotat(e.target.value)}
              rows={2}
              placeholder="F.eks. sjåføren satte pallene ved porten"
              className="text-base"
            />
          </div>

          <SignaturePad value={signatur} onChange={setSignatur} label="Signatur (valgfritt)" />
        </section>

        {/*
         * Knappen ligg i vanleg flyt, ikkje fast i botnen. Ei fixed-linje kan
         * hamne UNDER tastaturet på Android, og då er innsendinga utilgjengeleg
         * heilt til brukaren lukkar det. Kassa gjer det same.
         */}
        <Button
          className="mt-6 h-16 w-full text-base [&_svg]:size-6"
          disabled={send.isPending}
          onClick={() => send.mutate()}
        >
          {send.isPending ? (
            <>
              <Loader2 className="mr-2 animate-spin" aria-hidden="true" />
              Registrerer mottaket …
            </>
          ) : (
            <>
              <PackageCheck className="mr-2" aria-hidden="true" />
              Registrer mottaket
            </>
          )}
        </Button>

        {/* Informasjonsplikta gjeld når opplysningane blir samla inn, ikkje
            seinare. Same grep som i kassa. */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Navnet og signaturen din lagres på mottaket som dokumentasjon på leveransen.{" "}
          <Link to="/personvern" className="underline underline-offset-2 hover:text-foreground">
            Personvern
          </Link>
        </p>
      </main>
    </div>
  );
}
