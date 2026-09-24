// Kassen: kurva med dagens prisar, når kunden hentar, kven som bestiller, og
// «Bestill med betalingsplikt». Reglane er dei same som i basen – skjemaet seier
// frå med ein gong, basen avgjer.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock, Loader2, PackageSearch, Send, Trash2, User } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { QuantityInput } from "@/components/QuantityInput";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { QK, fetchCatalog } from "@/lib/orders";
import { useOrderSettings, useSettings } from "@/lib/settings";
import {
  clearPickupCart,
  lesKunde,
  lesUtkast,
  skrivKunde,
  skrivUtkast,
  slettKunde,
  slettUtkast,
  usePickupCart,
} from "@/lib/pickup-cart";
import {
  TOMT_SKJEMA,
  leggTilDager,
  osloIDag,
  sjekkSkjema,
  tilInnsending,
  type Feltfeil,
  type KasseSkjema,
} from "@/lib/pickup-form";
import { requestEmailsInBackground, submitPickupOrder } from "@/lib/pickup-orders";
import { linjesum, prisInklMva, summer } from "@/lib/mva";
import { ANGRERETT_KORT } from "@/lib/vilkar";
import { checkRateLimit } from "@/lib/rate-limiter";
import { kr, num, pipeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function Felt({
  label,
  htmlFor,
  required,
  hint,
  feil,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  feil?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {feil ? (
        <p id={`${htmlFor}-feil`} className="text-xs font-medium text-destructive">
          {feil}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Ein stor knapp i eit par. aria-pressed, så skjermlesaren høyrer kva som er valt. */
function Valg({
  id,
  valt,
  onClick,
  ikon,
  tittel,
  tekst,
}: {
  id?: string;
  valt: boolean;
  onClick: () => void;
  ikon: ReactNode;
  tittel: string;
  tekst?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-pressed={valt}
      onClick={onClick}
      className={cn(
        "flex min-h-[4.5rem] flex-1 items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        valt ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className={cn("mt-0.5 [&_svg]:size-5", valt ? "text-primary" : "text-muted-foreground")} aria-hidden="true">
        {ikon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold text-foreground">{tittel}</span>
        {tekst ? <span className="block text-xs text-muted-foreground">{tekst}</span> : null}
      </span>
    </button>
  );
}

export default function PickupCheckout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cart = usePickupCart();
  const { data: settings } = useSettings();
  const orderSettings = useOrderSettings();
  const katalog = useQuery({ queryKey: QK.catalog, queryFn: fetchCatalog });

  const [skjema, setSkjema] = useState<KasseSkjema>(() => ({ ...TOMT_SKJEMA, ...lesKunde(), ...lesUtkast() }));
  // Eininga hugsar kunden berre når han har bede om det. Ligg det noko lagra,
  // kryssa han av sist, og krysset står til han tek det bort.
  const [husk, setHusk] = useState(() => Object.keys(lesKunde()).length > 0);
  const [feil, setFeil] = useState<Feltfeil | null>(null);
  const [sender, setSender] = useState(false);
  // Etter innsending er kurva tom med vilje – då skal vakta under ikkje slå til
  const sendt = useRef(false);

  const iDag = osloIDag();
  const vat = settings?.vat_rate ?? 25;
  const kreverTelefon = settings?.require_phone ?? true;
  const frist = orderSettings.data?.payment_terms_days ?? 14;
  // Før kunden har valt, blir prisane viste med mva
  const medMva = skjema.kundetype !== "bedrift";

  useEffect(() => {
    if (cart.count === 0 && !sendt.current) navigate("/bestill", { replace: true });
  }, [cart.count, navigate]);

  useEffect(() => {
    skrivUtkast(skjema);
  }, [skjema]);

  const set = <K extends keyof KasseSkjema>(k: K, v: KasseSkjema[K]) => {
    setSkjema((s) => ({ ...s, [k]: v }));
    setFeil((f) => (f?.felt === k ? null : f));
  };

  /*
   * Dagens pris, ikkje prisen då vara blei lagd i kurva. Ein privatperson skal
   * sjå totalprisen han faktisk blir fakturert for, og basen reknar med prisen
   * som gjeld når bestillinga kjem inn.
   */
  const linjer = useMemo(() => {
    const kart = new Map((katalog.data ?? []).map((t) => [t.id, t]));
    return cart.lines.map((l) => {
      const vare = kart.get(l.pipe_type_id);
      const problem = !katalog.data
        ? null
        : !vare || !vare.active
          ? "Varen finnes ikke lenger i katalogen"
          : vare.price === null
            ? "Varen har ikke lenger pris og kan ikke bestilles på nett"
            : null;
      return { ...l, pris: vare?.price ?? l.price, lager: vare?.stock ?? null, problem };
    });
  }, [cart.lines, katalog.data]);

  const harProblem = linjer.some((l) => l.problem);
  const sum = summer(
    linjer.filter((l) => !l.problem).map((l) => linjesum(l.pris, l.quantity)),
    vat,
  );
  const feilFor = (felt: keyof KasseSkjema) => (feil?.felt === felt ? feil.melding : undefined);
  const feilId = (felt: keyof KasseSkjema) => (feilFor(felt) ? `kasse-${felt}-feil` : undefined);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sender) return;
    if (harProblem) {
      toast({ title: "Fjern varene som ikke kan bestilles", variant: "destructive" });
      return;
    }
    // Prisane i kurva er frå då varene blei lagde i henne. Kunden skal sjå
    // totalprisen han faktisk blir fakturert for, så utan dagens prisar blir
    // ingenting sendt.
    if (!katalog.data) {
      if (katalog.isError) void katalog.refetch();
      toast({
        title: katalog.isError ? "Klarte ikke å hente dagens priser" : "Henter dagens priser",
        description: "Prøv igjen om et øyeblikk.",
        variant: "destructive",
      });
      return;
    }
    const f = sjekkSkjema(skjema, { kreverTelefon, iDag });
    if (f) {
      setFeil(f);
      toast({ title: f.melding, variant: "destructive" });
      document.getElementById(`kasse-${f.felt}`)?.focus();
      return;
    }
    const grense = checkRateLimit("pipe-bestilling", 3, 60_000);
    if (!grense.allowed) {
      const sekund = Math.max(1, Math.ceil(grense.retryAfterMs / 1000));
      toast({ title: "Vent litt", description: `Prøv igjen om ${sekund} sekunder.`, variant: "destructive" });
      return;
    }

    setSender(true);
    try {
      const { id } = await submitPickupOrder(tilInnsending(skjema, cart.lines, iDag));
      // Kvitteringa og varselet til kontoret. Ventar ikkje: bestillinga er lagra,
      // og ein e-post som feilar skal aldri kunne stoppe henne.
      requestEmailsInBackground(id);
      if (husk) skrivKunde(skjema);
      else slettKunde();
      slettUtkast();
      sendt.current = true;
      clearPickupCart();
      navigate(`/bestilling/${id}`, { replace: true });
    } catch (err) {
      // Meldinga frå basen er norsk og skriven for kunden. Kurva og skjemaet
      // blir ståande, så kunden kan prøve på nytt utan å taste alt om att.
      toast({
        title: "Bestillingen ble ikke sendt",
        description: err instanceof Error ? err.message : "Ukjent feil. Prøv igjen.",
        variant: "destructive",
      });
      setSender(false);
    }
  };

  if (orderSettings.isPlaceholderData || orderSettings.isLoading) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" back="/bestill" />
        <main className="mx-auto max-w-2xl space-y-3 px-3 pt-4 sm:px-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (!orderSettings.data?.accept_orders) {
    return (
      <div className="hm-page min-h-screen">
        <TopBar title="Bestilling" back="/" />
        <main className="mx-auto max-w-lg px-3 pt-6 sm:px-4">
          <div className="hm-card flex flex-col items-center gap-3 p-8 text-center">
            <PackageSearch className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">Vi tar ikke imot bestillinger på nett akkurat nå</h2>
            <p className="text-sm text-muted-foreground">
              {settings?.phone ? `Ring oss på ${settings.phone}, så hjelper vi deg.` : "Ta kontakt med oss, så hjelper vi deg."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Bestilling" back="/bestill" />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-10 sm:px-4">
        <form onSubmit={send} className="space-y-4" noValidate>
          {/* ------------------------------------------------------------ kurva */}
          <section className="hm-card p-4" aria-labelledby="kasse-varer">
            <h2 id="kasse-varer" className="text-base font-semibold text-foreground">
              Bestillingen
            </h2>
            <ul className="mt-2 divide-y divide-border">
              {linjer.map((l) => {
                const eks = linjesum(l.pris, l.quantity);
                return (
                  <li key={l.pipe_type_id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-foreground">{pipeLabel(l.name, l.dimension)}</p>
                        <p className="tabular text-xs text-muted-foreground">
                          {kr(medMva ? prisInklMva(l.pris, vat) : l.pris)} kr/{l.unit} {medMva ? "inkl. mva" : "eks. mva"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.remove(l.pipe_type_id)}
                        aria-label={`Fjern ${pipeLabel(l.name, l.dimension)}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>

                    {l.problem ? (
                      <p className="mt-2 text-sm font-medium text-destructive">{l.problem}. Fjern den for å gå videre.</p>
                    ) : (
                      <>
                        <div className="mt-2">
                          <QuantityInput
                            value={l.quantity}
                            unit={l.unit}
                            presets={[]}
                            onChange={(v) => {
                              if (v !== null && v > 0) cart.setQuantity(l.pipe_type_id, v);
                            }}
                          />
                        </div>
                        {l.lager !== null && l.quantity > l.lager ? (
                          <p className="tabular mt-2 text-xs text-warning-ink">
                            Lageret viser {num(l.lager)} {l.unit}. Kontoret sjekker resten.
                          </p>
                        ) : null}
                        <p className="tabular mt-1 text-right text-sm font-semibold text-foreground">
                          {kr(medMva ? summer([eks], vat).inkl : eks)} kr
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link to="/bestill" className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
              Legg til flere varer
            </Link>
          </section>

          {/* ------------------------------------------------------------- når */}
          <section className="hm-card space-y-3 p-4" aria-labelledby="kasse-naar">
            <h2 id="kasse-naar" className="text-base font-semibold text-foreground">
              Når henter du?
            </h2>
            <div role="group" aria-labelledby="kasse-naar" className="flex flex-col gap-2 sm:flex-row">
              <Valg
                id="kasse-henterNaa"
                valt={skjema.henterNaa === true}
                onClick={() => set("henterNaa", true)}
                ikon={<Clock />}
                tittel="Henter nå"
                tekst="I dag, så snart kontoret har godkjent"
              />
              <Valg
                valt={skjema.henterNaa === false}
                onClick={() => set("henterNaa", false)}
                ikon={<CalendarDays />}
                tittel="Velg dag"
                tekst="Inntil 90 dager fram"
              />
            </div>
            {feilFor("henterNaa") ? <p className="text-xs font-medium text-destructive">{feilFor("henterNaa")}</p> : null}
            {skjema.henterNaa === true && settings?.pickup_note ? (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{settings.pickup_note}</p>
            ) : null}
            {skjema.henterNaa === false ? (
              <Felt label="Hentedag" htmlFor="kasse-hentedag" required feil={feilFor("hentedag")}>
                <Input
                  id="kasse-hentedag"
                  type="date"
                  min={iDag}
                  max={leggTilDager(iDag, 90)}
                  value={skjema.hentedag}
                  onChange={(e) => set("hentedag", e.target.value)}
                  aria-invalid={Boolean(feilFor("hentedag"))}
                  aria-describedby={feilId("hentedag")}
                  className="h-12 text-base"
                />
              </Felt>
            ) : null}
          </section>

          {/* ------------------------------------------------------------- kven */}
          <section className="hm-card space-y-4 p-4" aria-labelledby="kasse-hvem">
            <h2 id="kasse-hvem" className="text-base font-semibold text-foreground">
              Hvem bestiller?
            </h2>
            <div role="group" aria-labelledby="kasse-hvem" className="flex gap-2">
              <Valg
                id="kasse-kundetype"
                valt={skjema.kundetype === "privat"}
                onClick={() => set("kundetype", "privat")}
                ikon={<User />}
                tittel="Privatperson"
              />
              <Valg
                valt={skjema.kundetype === "bedrift"}
                onClick={() => set("kundetype", "bedrift")}
                ikon={<Building2 />}
                tittel="Bedrift"
              />
            </div>
            {feilFor("kundetype") ? <p className="text-xs font-medium text-destructive">{feilFor("kundetype")}</p> : null}

            {skjema.kundetype === "bedrift" ? (
              <>
                <Felt label="Firma" htmlFor="kasse-firma" required feil={feilFor("firma")}>
                  <Input
                    id="kasse-firma"
                    autoComplete="organization"
                    value={skjema.firma}
                    onChange={(e) => set("firma", e.target.value)}
                    aria-invalid={Boolean(feilFor("firma"))}
                    aria-describedby={feilId("firma")}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt
                  label="Organisasjonsnummer"
                  htmlFor="kasse-orgnr"
                  required
                  hint="Ni siffer. Vi fakturerer firmaet på dette nummeret."
                  feil={feilFor("orgnr")}
                >
                  <Input
                    id="kasse-orgnr"
                    inputMode="numeric"
                    placeholder="999 999 999"
                    value={skjema.orgnr}
                    onChange={(e) => set("orgnr", e.target.value)}
                    aria-invalid={Boolean(feilFor("orgnr"))}
                    aria-describedby={feilId("orgnr")}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt label="Kontaktperson" htmlFor="kasse-navn" required feil={feilFor("navn")}>
                  <Input
                    id="kasse-navn"
                    autoComplete="name"
                    value={skjema.navn}
                    onChange={(e) => set("navn", e.target.value)}
                    aria-invalid={Boolean(feilFor("navn"))}
                    aria-describedby={feilId("navn")}
                    className="h-12 text-base"
                  />
                </Felt>
              </>
            ) : skjema.kundetype === "privat" ? (
              <>
                <Felt label="Navn" htmlFor="kasse-navn" required feil={feilFor("navn")}>
                  <Input
                    id="kasse-navn"
                    autoComplete="name"
                    value={skjema.navn}
                    onChange={(e) => set("navn", e.target.value)}
                    aria-invalid={Boolean(feilFor("navn"))}
                    aria-describedby={feilId("navn")}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt label="Gateadresse" htmlFor="kasse-gate" required hint="Fakturaen sendes hit." feil={feilFor("gate")}>
                  <Input
                    id="kasse-gate"
                    autoComplete="address-line1"
                    value={skjema.gate}
                    onChange={(e) => set("gate", e.target.value)}
                    aria-invalid={Boolean(feilFor("gate"))}
                    aria-describedby={feilId("gate")}
                    className="h-12 text-base"
                  />
                </Felt>
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <Felt label="Postnr." htmlFor="kasse-postnr" required feil={feilFor("postnr")}>
                    <Input
                      id="kasse-postnr"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={4}
                      value={skjema.postnr}
                      onChange={(e) => set("postnr", e.target.value)}
                      aria-invalid={Boolean(feilFor("postnr"))}
                      aria-describedby={feilId("postnr")}
                      className="h-12 text-base"
                    />
                  </Felt>
                  <Felt label="Sted" htmlFor="kasse-sted" required feil={feilFor("sted")}>
                    <Input
                      id="kasse-sted"
                      autoComplete="address-level2"
                      value={skjema.sted}
                      onChange={(e) => set("sted", e.target.value)}
                      aria-invalid={Boolean(feilFor("sted"))}
                      aria-describedby={feilId("sted")}
                      className="h-12 text-base"
                    />
                  </Felt>
                </div>
              </>
            ) : null}

            {skjema.kundetype ? (
              <>
                <Felt label="Telefon" htmlFor="kasse-telefon" required={kreverTelefon} feil={feilFor("telefon")}>
                  <Input
                    id="kasse-telefon"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={skjema.telefon}
                    onChange={(e) => set("telefon", e.target.value)}
                    aria-invalid={Boolean(feilFor("telefon"))}
                    aria-describedby={feilId("telefon")}
                    className="h-12 text-base"
                  />
                </Felt>
                <Felt
                  label="E-post"
                  htmlFor="kasse-epost"
                  required
                  hint="Kvitteringen og beskjeden om henting kommer hit."
                  feil={feilFor("epost")}
                >
                  <Input
                    id="kasse-epost"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={skjema.epost}
                    onChange={(e) => set("epost", e.target.value)}
                    aria-invalid={Boolean(feilFor("epost"))}
                    aria-describedby={feilId("epost")}
                    className="h-12 text-base"
                  />
                </Felt>
                <div className="flex items-center gap-3">
                  <Checkbox id="kasse-husk" checked={husk} onCheckedChange={(v) => setHusk(v === true)} className="h-5 w-5" />
                  <Label htmlFor="kasse-husk" className="cursor-pointer py-1 text-sm font-normal text-foreground">
                    Husk opplysningene mine på denne enheten
                  </Label>
                </div>
              </>
            ) : null}
          </section>

          {/* ------------------------------------------------------- kommentar */}
          <section className="hm-card p-4">
            <Felt label="Kommentar" htmlFor="kasse-kommentar" hint="Valgfritt. Noe kontoret bør vite?" feil={feilFor("kommentar")}>
              <Textarea
                id="kasse-kommentar"
                rows={3}
                value={skjema.kommentar}
                onChange={(e) => set("kommentar", e.target.value)}
                aria-invalid={Boolean(feilFor("kommentar"))}
                aria-describedby={feilId("kommentar")}
                className="text-base"
              />
            </Felt>
          </section>

          {/* ---------------------------------------------------- oppsummering */}
          <section className="hm-card p-4" aria-labelledby="kasse-sum">
            <h2 id="kasse-sum" className="text-base font-semibold text-foreground">
              Oppsummering
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Sum eks. mva</dt>
                <dd className="tabular text-foreground">{kr(sum.eks)} kr</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Mva {num(vat)} %</dt>
                <dd className="tabular text-foreground">{kr(sum.mva)} kr</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="text-base font-semibold text-foreground">Sum inkl. mva</dt>
                <dd className="tabular text-2xl font-bold text-foreground">{kr(sum.inkl)} kr</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted-foreground">Betaling: faktura, {frist} dager.</p>
            {skjema.kundetype !== "bedrift" ? (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {ANGRERETT_KORT.join(" ")}{" "}
                <Link to="/vilkar" className="font-medium text-foreground underline underline-offset-2">
                  Les vilkårene
                </Link>
                .
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                <Link to="/vilkar" className="underline underline-offset-2">
                  Vilkårene
                </Link>{" "}
                gjelder for bestillingen.
              </p>
            )}
          </section>

          <Button
            type="submit"
            disabled={sender || harProblem || !katalog.data}
            className="h-16 w-full text-lg font-semibold [&_svg]:size-6"
          >
            {sender ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Sender …
              </>
            ) : (
              <>
                <Send aria-hidden="true" />
                Bestill med betalingsplikt
              </>
            )}
          </Button>
          {/* Knappen står sperra til dagens prisar er henta. Her står kvifor. */}
          {!katalog.data ? (
            <p role="status" className="text-center text-sm text-muted-foreground">
              {katalog.isError ? (
                <>
                  Klarte ikke å hente dagens priser.{" "}
                  <button
                    type="button"
                    onClick={() => void katalog.refetch()}
                    className="inline-flex min-h-11 items-center px-1 font-medium text-foreground underline underline-offset-2"
                  >
                    Prøv igjen
                  </button>
                </>
              ) : (
                "Henter dagens priser …"
              )}
            </p>
          ) : null}

          {/* Informasjonsplikta i GDPR artikkel 13 gjeld på innsamlingstidspunktet */}
          <p className="pb-2 text-center text-xs text-muted-foreground">
            Vi lagrer navn, kontaktopplysninger og bestillingen for å kunne gjennomføre og fakturere den.{" "}
            <Link to="/personvern" className="underline underline-offset-2">
              Slik behandler vi opplysningene
            </Link>
            .
          </p>
        </form>
      </main>

      <LegalFooter />
    </div>
  );
}
