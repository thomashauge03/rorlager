import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Send } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { FastBunn } from "@/components/FastBunn";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { loggUt, useAuth, useMeg } from "@/lib/auth";
import {
  EMPTY_CUSTOMER,
  LAST_ORDER_KEY,
  clearCart,
  forgetCustomer,
  hasSavedCustomer,
  readCustomer,
  useCart,
  writeCustomer,
} from "@/lib/cart";
import type { SavedCustomer } from "@/lib/cart";
import { fetchProsjektliste, submitOrder } from "@/lib/orders";
import { ProsjektVelger, type ProsjektSvar } from "@/components/ProsjektVelger";
import { useSettings } from "@/lib/settings";
import { useNesteFelt } from "@/lib/neste-felt";
import { checkRateLimit } from "@/lib/rate-limiter";
import { kr, num, pipeLabel } from "@/lib/format";
import { ANNET_TEKST } from "@/lib/annet";
import { AnnetMerke } from "@/components/AnnetDialog";
import { Sum } from "@/components/Pris";
import { summer } from "@/lib/mva";

function Field({
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
  /** Står under feltet, ikkje berre i ein toast som forsvinn (WCAG 3.3.1). */
  feil?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive-ink">*</span>}
      </Label>
      {children}
      {feil ? (
        <p id={`${htmlFor}-feil`} className="text-sm font-medium text-destructive-ink">
          {feil}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Feltet som stoppa innsendinga, og kvifor. */
type Feltfeil = { felt: string; melding: string };

/** Kva felt-id ein nøkkel i skjemaet høyrer til – så feilen forsvinn når han blir retta. */
const FELT_FOR: Partial<Record<keyof SavedCustomer, string>> = {
  customer_name: "navn",
  customer_phone: "telefon",
  customer_email: "epost",
  project: "prosjekt",
};

export default function Checkout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cart = useCart();
  const { data: settings } = useSettings();

  const [form, setForm] = useState<SavedCustomer>(() => ({ ...EMPTY_CUSTOMER, ...readCustomer() }));
  // Avkryssa når kunden alt er hugsa – då har han sagt ja før
  const [husk, setHusk] = useState(hasSavedCustomer);
  const [comment, setComment] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const nesteFelt = useNesteFelt();
  const queryClient = useQueryClient();

  /*
   * EIN TILSETT TEK UT PÅ BRUKAREN SIN.
   *
   * Er nokon logga inn, er det ein tilsett, og uttaket blir registrert på han:
   * namn og e-post kjem frå innlogginga (basen tek dei derifrå uansett), og han
   * skriv berre kva jobb varene skal til. Ingen telefon og ingen signatur –
   * innlogginga er dokumentasjonen.
   */
  const auth = useAuth();
  const meg = useMeg(auth.email);
  // Ei rolle, ikkje berre ei innlogging: sjølvregistrering er open, og ein
  // framand med konto er ein kunde. Basen avgjer det same (pipe_submit_order).
  const ansatt = !auth.checking && Boolean(auth.email) && auth.roleKnown && auth.role !== null;
  /** Innlogga, men rolla er ikkje svart enno – vent før skjemaet blir vist. */
  const ventarPåRolle = !auth.checking && Boolean(auth.email) && !auth.roleKnown && !auth.roleFailed;

  /*
   * Same referanse for kvart forsøk på dette uttaket. Forsvinn svaret på veg
   * tilbake og kunden trykkjer igjen, gir basen tilbake det første uttaket i
   * staden for å trekkje lageret ein gong til.
   */
  const [clientRef] = useState(() => crypto.randomUUID());
  const ansattNavn = meg.data?.navn ?? auth.email ?? "";

  /*
   * PROSJEKTET FRÅ EI LISTE, IKKJE FRÅ HUGSEN.
   *
   * Fritekst gav «Storgata 4», «storgata4» og «Storg. 4» på same jobb, og
   * fakturagrunnlaget, som samlar uttaka på teksten, fekk tre jobbar. Med lista
   * skriv basen teksten sjølv.
   *
   * Feilar lista – til dømes før 20261014100000 er køyrd – er fritekstfeltet
   * tilbake, så ingen blir ståande utan å kunne sende inn.
   */
  const prosjektliste = useQuery({
    queryKey: ["pipe_prosjektliste", auth.email],
    queryFn: fetchProsjektliste,
    enabled: ansatt,
    staleTime: 5 * 60_000,
  });
  const medListe = prosjektliste.isSuccess && prosjektliste.data.length > 0;
  const [prosjektValg, setProsjektValg] = useState<ProsjektSvar>(null);

  // Kommentaren er valfri og ligg bak ei lenkje
  const [visKommentar, setVisKommentar] = useState(false);
  const [opnaKommentar, setOpnaKommentar] = useState(false);

  // Etter innsending er kurven tom med vilje – då skal vakta under ikkje slå til
  const submitted = useRef(false);

  const showPrices = settings?.show_prices ?? true;
  const vat = settings?.vat_rate ?? 25;
  const requirePhone = settings?.require_phone ?? true;
  const requireSignature = settings?.require_signature ?? false;

  useEffect(() => {
    if (cart.count === 0 && !submitted.current) navigate("/kurv", { replace: true });
  }, [cart.count, navigate]);

  const [feltFeil, setFeltFeil] = useState<Feltfeil | null>(null);
  const feilFor = (felt: string) => (feltFeil?.felt === felt ? feltFeil.melding : null);
  /** aria-attributta eit felt treng for at skjermlesaren skal seie kva som er gale. */
  const ariaFor = (felt: string) => ({
    "aria-invalid": feltFeil?.felt === felt || undefined,
    "aria-describedby": feltFeil?.felt === felt ? `${felt}-feil` : undefined,
  });

  const set = (key: keyof SavedCustomer, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFeltFeil((f) => (f && f.felt === FELT_FOR[key] ? null : f));
  };

  /** Stoppar innsendinga: feilen ved feltet, fokus dit, og ein toast for den som ser opp. */
  const stopp = (felt: string, melding: string, fokus = felt) => {
    setFeltFeil({ felt, melding });
    toast({ title: melding, variant: "destructive" });
    document.getElementById(fokus)?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setFeltFeil(null);

    const name = form.customer_name.trim();
    if (ansatt) {
      if (medListe && !prosjektValg) {
        stopp("prosjekt-sok", "Velg hvilket prosjekt varene skal på");
        return;
      }
      if ((!medListe || prosjektValg?.kind === "annet") && !form.project.trim()) {
        stopp(medListe ? "prosjekt-sok" : "prosjekt", "Skriv hvilken jobb eller hvilket prosjekt varene skal til", "prosjekt");
        return;
      }
    } else {
      if (!name) {
        stopp("navn", "Skriv inn navnet ditt");
        return;
      }
      if (requirePhone && !form.customer_phone.trim()) {
        stopp("telefon", "Skriv inn telefonnummeret ditt, så vi kan nå deg");
        return;
      }
      // Påkravd, men utan formatsjekk med vilje: har kunden ingen e-post, skriv han «ingen»
      if (!form.customer_email.trim()) {
        stopp("epost", "Skriv inn e-post. Har du ikke e-post, skriv «ingen».");
        return;
      }
      if (requireSignature && !signature) {
        stopp("signatur", "Skriv signaturen din i ruta nederst", "signatur-felt");
        return;
      }
    }
    if (cart.lines.length === 0) {
      toast({ title: "Handlekurven er tom", variant: "destructive" });
      return;
    }

    const limit = checkRateLimit("pipe-order", 5, 60_000);
    if (!limit.allowed) {
      const sekund = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
      toast({
        title: "Vent litt",
        description: `Du har sendt inn flere uttak på kort tid. Prøv igjen om ${sekund} sekunder.`,
        variant: "destructive",
      });
      return;
    }

    const valgtProsjektId = medListe && prosjektValg?.kind === "prosjekt" ? prosjektValg.id : null;

    setSending(true);
    try {
      // Heile linja, ikkje berre id og mengd: ei annet-linje har namnet sitt med
      const lines = cart.lines;
      const order = await submitOrder(
        ansatt
          ? {
              customer_name: ansattNavn,
              customer_phone: null,
              customer_email: auth.email,
              company: null,
              // Med eit prosjekt frå lista skriv basen teksten sjølv
              project: valgtProsjektId ? null : form.project.trim(),
              project_id: valgtProsjektId,
              comment: comment.trim() || null,
              signature: null,
              lines,
              client_ref: clientRef,
            }
          : {
              customer_name: name,
              customer_phone: form.customer_phone.trim() || null,
              customer_email: form.customer_email.trim(),
              company: form.company.trim() || null,
              project: form.project.trim() || null,
              comment: comment.trim() || null,
              signature,
              lines,
              client_ref: clientRef,
            },
      );

      // Den tilsette blir ikkje hugsa som kunde. Kunden blir berre hugsa når han
      // har kryssa av: på eit delt nettbrett i lageret ville neste kunde elles
      // fått namn, telefon og e-post hans ferdig utfylt.
      if (!ansatt && !husk) forgetCustomer();
      if (!ansatt && husk) {
        writeCustomer({
          customer_name: name,
          customer_phone: form.customer_phone.trim(),
          customer_email: form.customer_email.trim(),
          company: form.company.trim(),
          project: form.project.trim(),
        });
      }

      submitted.current = true;
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch {
        /* privat modus – kvitteringa lever i navigeringstilstanden så lenge */
      }
      clearCart();
      navigate("/kvittering", { replace: true, state: { order } });
    } catch (err) {
      // Meldinga frå databasen er allereie norsk og skriven for kunden.
      // Kurven blir ståande, slik at han kan prøve på nytt utan å taste alt om igjen.
      toast({
        title: "Uttaket ble ikke sendt",
        description: err instanceof Error ? err.message : "Ukjent feil. Prøv igjen.",
        variant: "destructive",
      });
      setSending(false);
    }
  };

  const kommentarFelt = visKommentar ? (
    <Field label="Kommentar" htmlFor="kommentar">
      <Textarea
        id="kommentar"
        autoFocus={opnaKommentar}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Noe lageret bør vite?"
        rows={3}
        className="text-base"
      />
    </Field>
  ) : (
    <button
      type="button"
      onClick={() => {
        setVisKommentar(true);
        setOpnaKommentar(true);
      }}
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Legg til kommentar
    </button>
  );

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Send inn uttak" back="/kurv" />

      {/* Luft nedst på telefonen: der står den faste bunnen med knappen */}
      <main className="mx-auto max-w-2xl px-3 pt-4 pb-40 sm:px-4 sm:pb-10">
        {/* Oppsummering: det siste kunden ser før han signerer */}
        <section className="hm-card p-4" aria-labelledby="oppsummering">
          <h2 id="oppsummering" className="text-base font-semibold text-foreground">
            Dette tar du ut
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {cart.lines.map((line) => (
              <li key={line.pipe_type_id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 text-sm text-foreground break-words">
                  {line.annet ? <AnnetMerke /> : null}
                  {pipeLabel(line.name, line.dimension)}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-foreground">
                  {num(line.quantity)} {line.unit}
                </span>
              </li>
            ))}
          </ul>
          {showPrices && !cart.hasUnpriced ? (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-start justify-between">
                <span className="text-sm font-semibold text-foreground">Sum</span>
                <Sum eks={cart.total} vat={vat} className="text-lg" />
              </div>
              {cart.annetCount > 0 ? (
                <p className="tabular text-right text-xs text-muted-foreground">
                  + {cart.annetCount} uten pris – {ANNET_TEKST.uttak.toLowerCase()}
                </p>
              ) : null}
            </div>
          ) : null}
          <Link to="/kurv" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
            Endre handlekurven
          </Link>
        </section>

        <form
          ref={nesteFelt.ref}
          onKeyDown={nesteFelt.onKeyDown}
          onSubmit={handleSubmit}
          className="mt-4 space-y-4"
          noValidate
        >
          {auth.checking || ventarPåRolle ? (
            <Skeleton className="h-48 w-full rounded-lg" />
          ) : ansatt ? (
            <section className="hm-card space-y-4 p-4" aria-labelledby="registreres">
              <div>
                <h2 id="registreres" className="text-base font-semibold text-foreground">
                  Registreres på deg
                </h2>
                <p className="mt-1 break-words text-sm text-foreground">
                  {ansattNavn}
                  {meg.data?.navn ? <span className="text-muted-foreground"> · {auth.email}</span> : null}
                </p>
                {/* Ein tilsett som gløymde å logge ut på eit delt nettbrett, skal
                    ikkje få neste kunde sitt uttak på seg */}
                <button
                  type="button"
                  onClick={() => void loggUt(queryClient)}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  Ikke deg? Logg ut
                </button>
              </div>

              {prosjektliste.isLoading ? (
                <Skeleton className="h-40 w-full rounded-lg" />
              ) : medListe ? (
                <Field label="Hvilket prosjekt skal varene på?" htmlFor="prosjekt-sok" required feil={feilFor("prosjekt-sok")}>
                  <ProsjektVelger
                    prosjekter={prosjektliste.data}
                    valgt={prosjektValg}
                    onVelg={setProsjektValg}
                    annetTekst={form.project}
                    onAnnetTekst={(v) => set("project", v)}
                  />
                </Field>
              ) : (
                <Field label="Jobb eller prosjekt" htmlFor="prosjekt" required hint="Hvor skal rørene brukes?" feil={feilFor("prosjekt")}>
                  <Input
                    id="prosjekt"
                    {...ariaFor("prosjekt")}
                    value={form.project}
                    onChange={(e) => set("project", e.target.value)}
                    placeholder="Byggefelt Vest, tomt 4"
                    className="h-12 text-base"
                  />
                </Field>
              )}

              {kommentarFelt}
            </section>
          ) : (
            <section className="hm-card space-y-4 p-4">
              <Field label="Navn" htmlFor="navn" required feil={feilFor("navn")}>
                <Input
                  id="navn"
                  {...ariaFor("navn")}
                  name="name"
                  autoComplete="name"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  placeholder="Ola Nordmann"
                  className="h-12 text-base"
                />
              </Field>

              <Field label="Telefon" htmlFor="telefon" required={requirePhone} feil={feilFor("telefon")}>
                <Input
                  id="telefon"
                  {...ariaFor("telefon")}
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.customer_phone}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  placeholder="900 00 000"
                  className="h-12 text-base"
                />
              </Field>

              <Field
                label="E-post"
                htmlFor="epost"
                required
                feil={feilFor("epost")}
                hint="Brukes hvis vi må sende deg dokumentasjon. Har du ikke e-post, skriv «ingen»."
              >
                <Input
                  id="epost"
                  {...ariaFor("epost")}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.customer_email}
                  onChange={(e) => set("customer_email", e.target.value)}
                  placeholder="ola@firma.no"
                  className="h-12 text-base"
                />
              </Field>

              <Field label="Firma" htmlFor="firma">
                <Input
                  id="firma"
                  name="organization"
                  autoComplete="organization"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  placeholder="Firmanavn"
                  className="h-12 text-base"
                />
              </Field>

              <Field label="Prosjekt eller adresse" htmlFor="prosjekt" hint="Hvor skal rørene brukes?">
                <Input
                  id="prosjekt"
                  value={form.project}
                  onChange={(e) => set("project", e.target.value)}
                  placeholder="Byggefelt Vest, tomt 4"
                  className="h-12 text-base"
                />
              </Field>

              <div className="flex items-center gap-3">
                <Checkbox id="kasse-husk" checked={husk} onCheckedChange={(v) => setHusk(v === true)} className="h-5 w-5" />
                {/* Luft i etiketten, så heile rada er lett å treffe med tommelen */}
                <Label htmlFor="kasse-husk" className="flex-1 cursor-pointer py-3 text-sm font-normal leading-snug text-foreground">
                  Husk opplysningene mine på denne enheten
                </Label>
              </div>

              {kommentarFelt}
            </section>
          )}

          {!ansatt && requireSignature ? (
            // tabIndex -1: teikneflata kan ikkje få fokus, så seksjonen tek det når signaturen manglar
            <section id="signatur-felt" tabIndex={-1} className="hm-card p-4 focus:outline-none">
              <SignaturePad
                value={signature}
                onChange={(s) => {
                  setSignature(s);
                  if (s) setFeltFeil((f) => (f?.felt === "signatur" ? null : f));
                }}
                label="Signatur (påkrevd)"
              />
              {feilFor("signatur") ? (
                <p className="mt-2 text-sm font-medium text-destructive-ink">{feilFor("signatur")}</p>
              ) : null}
            </section>
          ) : null}

          {/* Informasjonsplikta i GDPR artikkel 13 gjeld på innsamlingstidspunktet,
              ikkje på førespurnad. Difor står lenka her, ved skjemaet, og ikkje
              berre i ein botntekst kunden aldri ser. */}
          <p className="text-center text-xs text-muted-foreground">
            Vi lagrer navn og mobilnummer for å kunne fakturere uttaket.{" "}
            <Link to="/personvern" className="underline underline-offset-2">
              Slik behandler vi opplysningene
            </Link>
            .
          </p>

          <FastBunn>
            {showPrices && !cart.hasUnpriced ? (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">Sum inkl. mva</span>
                <span className="tabular text-lg font-bold text-foreground">{kr(summer([cart.total], vat).inkl)} kr</span>
              </div>
            ) : null}
            <Button type="submit" disabled={sending} className="h-14 w-full text-lg font-semibold sm:h-16 [&_svg]:size-6">
              {sending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Sender inn …
                </>
              ) : (
                <>
                  <Send aria-hidden="true" />
                  Send inn uttak
                </>
              )}
            </Button>
          </FastBunn>
        </form>
      </main>
    </div>
  );
}
