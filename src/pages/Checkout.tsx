import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { EMPTY_CUSTOMER, LAST_ORDER_KEY, clearCart, readCustomer, useCart, writeCustomer } from "@/lib/cart";
import type { SavedCustomer } from "@/lib/cart";
import { submitOrder } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
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
    if (!name) {
      toast({ title: "Skriv inn navnet ditt", variant: "destructive" });
      return;
    }
    if (requirePhone && !form.customer_phone.trim()) {
      toast({ title: "Telefonnummer mangler", description: "Vi trenger et nummer for å nå deg.", variant: "destructive" });
      return;
    }
    if (requireSignature && !signature) {
      toast({ title: "Signatur mangler", description: "Skriv signaturen din i ruta nederst.", variant: "destructive" });
      return;
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
      const order = await submitOrder({
        customer_name: name,
        customer_phone: form.customer_phone.trim() || null,
        customer_email: form.customer_email.trim() || null,
        company: form.company.trim() || null,
        project: form.project.trim() || null,
        comment: comment.trim() || null,
        signature,
        lines: cart.lines.map((l) => ({ pipe_type_id: l.pipe_type_id, quantity: l.quantity })),
      });

      writeCustomer({
        customer_name: name,
        customer_phone: form.customer_phone.trim(),
        customer_email: form.customer_email.trim(),
        company: form.company.trim(),
        project: form.project.trim(),
      });

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

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Send inn uttak" back="/kurv" />

      <main className="mx-auto max-w-2xl px-3 pt-4 pb-10 sm:px-4">
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
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

            <Field label="E-post" htmlFor="epost" hint="Valgfritt. Brukes hvis vi må sende deg dokumentasjon.">
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

            <Field label="Kommentar" htmlFor="kommentar">
              <Textarea
                id="kommentar"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Noe lageret bør vite?"
                rows={3}
                className="text-base"
              />
            </Field>
          </section>

          {requireSignature ? (
            <section className="hm-card p-4">
              <SignaturePad value={signature} onChange={setSignature} label="Signatur (påkrevd)" />
            </section>
          ) : null}

          <Button type="submit" disabled={sending} className="h-16 w-full text-lg font-semibold [&_svg]:size-6">
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
        </form>
      </main>
    </div>
  );
}
