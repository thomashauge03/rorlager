import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Send } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { FastBunn } from "@/components/FastBunn";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { loggUt, useAuth, useMeg } from "@/lib/auth";
import { EMPTY_CUSTOMER, LAST_ORDER_KEY, clearCart, readCustomer, useCart, writeCustomer } from "@/lib/cart";
import type { SavedCustomer } from "@/lib/cart";
import { submitOrder } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import { useNesteFelt } from "@/lib/neste-felt";
import { checkRateLimit } from "@/lib/rate-limiter";
import { kr, num, pipeLabel } from "@/lib/format";

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function Checkout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const cart = useCart();
  const { data: settings } = useSettings();

  const [form, setForm] = useState<SavedCustomer>(() => ({ ...EMPTY_CUSTOMER, ...readCustomer() }));
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
  const ansatt = !auth.checking && Boolean(auth.email);
  const ansattNavn = meg.data?.navn ?? auth.email ?? "";

  // Kommentaren er valfri og ligg bak ei lenkje
  const [visKommentar, setVisKommentar] = useState(false);
  const [opnaKommentar, setOpnaKommentar] = useState(false);

  // Etter innsending er kurven tom med vilje – då skal vakta under ikkje slå til
  const submitted = useRef(false);

  const showPrices = settings?.show_prices ?? true;
  const requirePhone = settings?.require_phone ?? true;
  const requireSignature = settings?.require_signature ?? false;

  useEffect(() => {
    if (cart.count === 0 && !submitted.current) navigate("/kurv", { replace: true });
  }, [cart.count, navigate]);

  const set = (key: keyof SavedCustomer, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const name = form.customer_name.trim();
    if (ansatt) {
      if (!form.project.trim()) {
        toast({ title: "Skriv hvilken jobb eller hvilket prosjekt varene skal til", variant: "destructive" });
        document.getElementById("prosjekt")?.focus();
        return;
      }
    } else {
      if (!name) {
        toast({ title: "Skriv inn navnet ditt", variant: "destructive" });
        return;
      }
      if (requirePhone && !form.customer_phone.trim()) {
        toast({ title: "Telefonnummer mangler", description: "Vi trenger et nummer for å nå deg.", variant: "destructive" });
        return;
      }
      // Påkravd, men utan formatsjekk med vilje: har kunden ingen e-post, skriv han «ingen»
      if (!form.customer_email.trim()) {
        toast({ title: "Skriv inn e-post", description: "Har du ikke e-post, skriv «ingen».", variant: "destructive" });
        document.getElementById("epost")?.focus();
        return;
      }
      if (requireSignature && !signature) {
        toast({ title: "Signatur mangler", description: "Skriv signaturen din i ruta nederst.", variant: "destructive" });
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

    setSending(true);
    try {
      const lines = cart.lines.map((l) => ({ pipe_type_id: l.pipe_type_id, quantity: l.quantity }));
      const order = await submitOrder(
        ansatt
          ? {
              customer_name: ansattNavn,
              customer_phone: null,
              customer_email: auth.email,
              company: null,
              project: form.project.trim(),
              comment: comment.trim() || null,
              signature: null,
              lines,
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
            },
      );

      // Den tilsette blir ikkje hugsa som kunde: på eit delt nettbrett ville
      // neste kunde fått namnet hans ferdig utfylt.
      if (!ansatt) {
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
                  {pipeLabel(line.name, line.dimension)}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold text-foreground">
                  {num(line.quantity)} {line.unit}
                </span>
              </li>
            ))}
          </ul>
          {showPrices && !cart.hasUnpriced ? (
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold text-foreground">Sum</span>
              <span className="tabular text-lg font-bold text-foreground">{kr(cart.total)} kr</span>
            </div>
          ) : null}
          <Link to="/kurv" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
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
          {auth.checking ? (
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

              <Field label="Jobb eller prosjekt" htmlFor="prosjekt" required hint="Hvor skal rørene brukes?">
                <Input
                  id="prosjekt"
                  value={form.project}
                  onChange={(e) => set("project", e.target.value)}
                  placeholder="Byggefelt Vest, tomt 4"
                  className="h-12 text-base"
                />
              </Field>

              {kommentarFelt}
            </section>
          ) : (
            <section className="hm-card space-y-4 p-4">
              <Field label="Navn" htmlFor="navn" required>
                <Input
                  id="navn"
                  name="name"
                  autoComplete="name"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  placeholder="Ola Nordmann"
                  className="h-12 text-base"
                />
              </Field>

              <Field label="Telefon" htmlFor="telefon" required={requirePhone}>
                <Input
                  id="telefon"
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
                hint="Brukes hvis vi må sende deg dokumentasjon. Har du ikke e-post, skriv «ingen»."
              >
                <Input
                  id="epost"
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

              {kommentarFelt}
            </section>
          )}

          {!ansatt && requireSignature ? (
            <section className="hm-card p-4">
              <SignaturePad value={signature} onChange={setSignature} label="Signatur (påkrevd)" />
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
                <span className="text-sm text-muted-foreground">Sum</span>
                <span className="tabular text-lg font-bold text-foreground">{kr(cart.total)} kr</span>
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
