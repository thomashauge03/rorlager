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
import { Camera, CheckCheck, Loader2, PackageCheck, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
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
import { MAKS_BILETE, lastOppBilde, slettBilde } from "@/lib/mottak-bilde";
import { useAuth } from "@/lib/auth";
import { num, parseNum, pipeLabel, shortDate } from "@/lib/format";
import { DEVIATION_LABEL, type Deviation, type ProjectOrderLine } from "@/lib/types";

/**
 * Nøkkelen er PER BRUKAR.
 *
 * Var global før. På eit delt nettbrett på plassen stod namnefeltet ferdig
 * utfylt med førre manns namn – og det er feltet som seier kven som tok imot
 * leveransen, på eit dokument som blir signert og sendt leverandøren.
 */
const NAVN_NØKKEL = (epost: string | null) => `rorlager.prosjekt.navn.${epost ?? "ukjend"}`;

const lesNavn = (epost: string | null) => {
  try {
    return localStorage.getItem(NAVN_NØKKEL(epost)) ?? "";
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
  const [navn, setNavn] = useState("");

  /*
   * E-POSTEN ER IKKJE KJEND PÅ FØRSTE RENDER.
   *
   * Namnenøkkelen er per brukar, men useAuth må først spørje Supabase. Ein
   * useState-initialisator las difor «…ukjend» og fann aldri det som blei
   * lagra – feltet stod tomt kvar gong sjølv om vi skreiv til det.
   */
  useEffect(() => {
    if (!auth.email) return;
    setNavn((n) => n || lesNavn(auth.email));
  }, [auth.email]);
  const [signatur, setSignatur] = useState<string | null>(null);
  const [notat, setNotat] = useState("");
  const navnRef = useRef<HTMLInputElement | null>(null);

  /*
   * Bileta. Lasta opp FØR mottaket blir sendt inn, så brukaren ser dei før han
   * kvitterer – og så opplastinga ikkje ligg i vegen for sjølve innsendinga når
   * dekninga er dårleg.
   */
  const [bilder, setBilder] = useState<{ sti: string; url: string }[]>([]);
  const [lasterOpp, setLasterOpp] = useState(0);
  const [utenBildeGrunn, setUtenBildeGrunn] = useState("");
  const [visUtenBilde, setVisUtenBilde] = useState(false);
  const filRef = useRef<HTMLInputElement | null>(null);

  /*
   * Nøkkelen for dette forsøket. Laga éin gong per opna skjerm, og den same om
   * brukaren må prøve på nytt. Går skrivinga gjennom men svaret blir borte i
   * dårleg dekning, svarar databasen med det same mottaket i staden for å lage
   * ei pulje nummer to med dei same tala.
   */
  // Lazy: `useRef(lagNøkkel())` ville kalla generatoren ved kvar einaste
  // render og kasta resultatet.
  const clientRef = useRef<string | null>(null);
  if (clientRef.current === null) clientRef.current = lagNøkkel();

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

  const velgBilder = async (filer: FileList | null) => {
    if (!filer || filer.length === 0) return;
    const plass = MAKS_BILETE - bilder.length;
    if (plass <= 0) {
      toast({ title: `Maks ${MAKS_BILETE} bilder`, description: "Fjern ett før du legger til flere." });
      return;
    }

    const valgte = Array.from(filer).slice(0, plass);
    setLasterOpp((n) => n + valgte.length);

    for (const [i, fil] of valgte.entries()) {
      try {
        const sti = await lastOppBilde(id, clientRef.current, fil, bilder.length + i);
        // Førehandsvisinga blir teikna frå fila på telefonen, ikkje henta ned
        // att frå Storage – det ville vore ein rundtur til ingen nytte.
        setBilder((f) => [...f, { sti, url: URL.createObjectURL(fil) }]);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Bildet ble ikke lastet opp",
          description: err instanceof Error ? err.message : "Sjekk dekningen og prøv igjen.",
        });
      } finally {
        setLasterOpp((n) => n - 1);
      }
    }

    // Same fila skal kunne veljast om att om opplastinga feila
    if (filRef.current) filRef.current.value = "";
  };

  /**
   * Fjernar biletet – òg frå bøtta.
   *
   * Feilar slettinga, blir miniatyren LAGT TILBAKE. Tidlegare forsvann ho frå
   * skjermen uansett, og brukaren trudde biletet var borte medan fila låg att
   * i bøtta, lesbar for alle på prosjektet. Eit bilete av folk på ein
   * byggjeplass skal ikkje bli liggjande fordi ei sletting stille feila.
   */
  const fjernBilde = async (sti: string) => {
    const bildet = bilder.find((b) => b.sti === sti);
    setBilder((f) => f.filter((b) => b.sti !== sti));
    try {
      await slettBilde(sti);
      if (bildet) URL.revokeObjectURL(bildet.url);
    } catch (err) {
      if (bildet) setBilder((f) => [...f, bildet]);
      toast({
        variant: "destructive",
        title: "Bildet ble ikke fjernet",
        description: err instanceof Error ? err.message : "Prøv igjen.",
      });
    }
  };

  /*
   * Frigjer blob-URL-ane ved avmontering.
   *
   * Dei held referansen til ORIGINALFILENE, ikkje dei komprimerte. Seks bilete
   * à 3–8 MB er 20–50 MB per mottak, og appen er ei enkeltside – ein
   * plassleiar som kvitterer for fem leveransar i eit skift utan å laste sida
   * på nytt, samlar opp hundrevis av megabyte. iOS Safari drep fana.
   */
  const bilderRef = useRef(bilder);
  bilderRef.current = bilder;
  useEffect(() => () => bilderRef.current.forEach((b) => URL.revokeObjectURL(b.url)), []);

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

      /*
       * OPPLASTINGEN SJEKKES FØRST.
       *
       * Motsatt rekkefølge ga en melding som var direkte usann: brukeren tok
       * tre bilder, de lastet fortsatt, og fikk «Ta minst ett bilde» mens
       * knappen over sa «Laster opp 3 bilder …». Det sannsynlige utfallet var
       * at han trykket «Fikk ikke tatt bilde» og skrev en grunn — og mottaket
       * ble registrert uten bilder som allerede lå i bøtta.
       */
      if (lasterOpp > 0) throw new Error("Vent til bildene er lastet opp.");

      // Databasen krev det same, men meldinga herifrå er den brukaren treng.
      if (bilder.length === 0 && !utenBildeGrunn.trim()) {
        throw new Error("Ta minst ett bilde av leveransen, eller skriv hvorfor det ikke lot seg gjøre.");
      }

      try {
        localStorage.setItem(NAVN_NØKKEL(auth.email), navn.trim());
      } catch {
        /* ignorer – berre ei bekvemmelegheit */
      }

      return submitReceipt({
        orderId: ordreId,
        receivedByName: navn,
        signature: signatur,
        note: notat.trim() || null,
        clientRef: clientRef.current,
        photos: bilder.map((b) => b.sti),
        noPhotoReason: bilder.length === 0 ? utenBildeGrunn.trim() : null,
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

        {/* ---------- Bildedokumentasjonen ---------- */}
        <section className="hm-card mt-4 space-y-3 p-3" aria-labelledby="bilder">
          <div className="flex items-center justify-between gap-2">
            <h2 id="bilder" className="text-sm font-semibold text-foreground">
              Bilde av leveransen <span className="text-destructive">*</span>
            </h2>
            {bilder.length > 0 ? (
              <span className="hm-chip border border-success/30 bg-success/15 text-success">
                {bilder.length} av {MAKS_BILETE}
              </span>
            ) : null}
          </div>

          <p className="text-sm text-muted-foreground">
            Ta bilde av pallene, følgeseddelen eller det som er galt. Det er dette som gjelder hvis leveransen må
            reklameres.
          </p>

          {/* capture="environment" åpner kameraet rett på baksida, ikkje
              filveljaren – eitt trykk mindre med hanskar på. */}
          <input
            ref={filRef}
            id="mottak-bilde"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => velgBilder(e.target.files)}
          />

          {bilder.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {bilder.map((b) => (
                <li key={b.sti} className="relative">
                  <img
                    src={b.url}
                    alt="Bilde fra mottaket"
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => fjernBilde(b.sti)}
                    aria-label="Fjern bildet"
                    className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-destructive shadow"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <Button
            type="button"
            variant={bilder.length === 0 ? "default" : "outline"}
            className="h-14 w-full text-base [&_svg]:size-6"
            disabled={lasterOpp > 0 || bilder.length >= MAKS_BILETE}
            onClick={() => filRef.current?.click()}
          >
            {lasterOpp > 0 ? (
              <>
                <Loader2 className="mr-2 animate-spin" aria-hidden="true" />
                Laster opp {lasterOpp} {lasterOpp === 1 ? "bilde" : "bilder"} …
              </>
            ) : (
              <>
                <Camera className="mr-2" aria-hidden="true" />
                {bilder.length === 0 ? "Ta bilde" : "Ta ett til"}
              </>
            )}
          </Button>

          {/*
           * Nødutgangen. Dekninga på ein byggjeplass er som ho er, og eit krav
           * som ikkje kan omgåast blir omgått på verre måtar – då kvitterer
           * ingen, eller dei kvitterer frå ein annan stad seinare.
           */}
          {bilder.length === 0 ? (
            visUtenBilde ? (
              <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-3">
                <Label htmlFor="uten-bilde" className="text-sm text-warning-ink dark:text-warning">
                  Hvorfor mangler bildet?
                </Label>
                <Input
                  id="uten-bilde"
                  value={utenBildeGrunn}
                  onChange={(e) => setUtenBildeGrunn(e.target.value)}
                  placeholder="F.eks. ingen dekning på plassen"
                  className="h-12 bg-background text-base"
                />
                <p className="text-xs text-warning-ink dark:text-warning">
                  Kontoret ser at bildet mangler, og hvorfor.
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full text-muted-foreground"
                onClick={() => setVisUtenBilde(true)}
              >
                Fikk ikke tatt bilde
              </Button>
            )
          ) : null}
        </section>

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
          Navnet, signaturen og bildene lagres på mottaket som dokumentasjon på leveransen. Bildene er ikke offentlige —
          bare kontoret og de som er på prosjektet ser dem.{" "}
          <Link to="/personvern" className="underline underline-offset-2 hover:text-foreground">
            Personvern
          </Link>
        </p>
      </main>
    </div>
  );
}
