/**
 * Sender e-postane om ei bestilling: kvittering og varsel ved innsending,
 * «klar til henting» og «avvist» når kontoret har handla.
 *
 * DENNE FUNKSJONEN TEK ALDRI IMOT EI E-POSTADRESSE, OG IKKJE EIN E-POSTTYPE.
 * Han tek id-en til ei bestilling og spør basen (pipe_email_claim) kva som står
 * att å sende. Mottakaren kjem frå bestillinga eller innstillingane. Kunne den
 * som kallar velje mottakar, var dette eit gratis spam-relé med Hauge Maskin som
 * avsendar – og kunne han velje type, kunne han fått «klar til henting» sendt
 * for ei bestilling som ikkje er godkjend.
 *
 * LENKJA I E-POSTEN BLIR BYGD AV APP_URL, ALDRI AV FØRESPURNADEN. Elles kunne
 * nokon sendt Origin: ond-side.no og fått ei ekte e-post frå Hauge Maskin til å
 * peike dit.
 *
 * SLÅR SEG PÅ AV SEG SJØLV. Manglar RESEND_API_KEY, EPOST_FRA eller APP_URL,
 * svarar funksjonen «ikkje sett opp» før han ser på nokon bestilling, og
 * ingenting blir merka som sendt.
 *
 * Rullast ut utan JWT-krav (--no-verify-jwt). Han stoler uansett ikkje på den som
 * kallar, og kassen sender ein enkel førespurnad utan eigne hovud, så han kjem
 * fram òg når fana blir lukka.
 */

import { byggEpost, type Krav } from "./epost.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const svar = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return svar({ feil: "Bare POST." }, 405);

  const URL_ = Deno.env.get("SUPABASE_URL");
  const TENESTE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const NOKKEL = Deno.env.get("RESEND_API_KEY");
  const FRA = Deno.env.get("EPOST_FRA");
  const APP = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");

  if (!URL_ || !TENESTE) return svar({ feil: "Funksjonen mangler oppsett." }, 500);

  // Ikkje sett opp er ikkje ein feil. Svaret kjem FØR vi ser på id-en, så
  // ingenting blir merka som sendt i ein periode der ingenting kan sendast.
  if (!NOKKEL || !FRA || !/^https?:\/\/[^/\s]+$/i.test(APP)) {
    return svar({ satt_opp: false, sendt: [], feilet: [] });
  }

  // Kroppen kjem som rein tekst: kassen sender han slik for å sleppe preflight.
  let id: unknown;
  try {
    id = JSON.parse(await req.text())?.id;
  } catch {
    return svar({ feil: "Ugyldig forespørsel." }, 400);
  }
  if (typeof id !== "string" || !UUID.test(id)) return svar({ feil: "Ugyldig forespørsel." }, 400);

  const hovud = { apikey: TENESTE, Authorization: `Bearer ${TENESTE}`, "Content-Type": "application/json" };
  const rpc = (namn: string, args: unknown) =>
    fetch(`${URL_}/rest/v1/rpc/${namn}`, { method: "POST", headers: hovud, body: JSON.stringify(args) });

  const krav = await rpc("pipe_email_claim", { p_order_id: id });
  if (!krav.ok) {
    console.error("pipe_email_claim", krav.status, await krav.text().catch(() => ""));
    return svar({ feil: "Fikk ikke tak i bestillingen." }, 500);
  }
  const data = (await krav.json()) as Krav;
  const eposter = Array.isArray(data?.emails) ? data.emails : [];

  const sendt: string[] = [];
  const feilet: string[] = [];

  for (const e of eposter) {
    const melding = byggEpost(e.type, data, APP, e.to);
    try {
      if (!melding) throw new Error("mangler innhold");
      const ut = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${NOKKEL}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FRA,
          to: [melding.to],
          subject: melding.subject,
          html: melding.html,
          text: melding.text,
          ...(melding.replyTo ? { reply_to: melding.replyTo } : {}),
        }),
      });
      if (!ut.ok) throw new Error(`resend ${ut.status} ${await ut.text().catch(() => "")}`);
      const r = (await ut.json().catch(() => ({}))) as { id?: string };
      await rpc("pipe_email_mark_sent", { p_order_id: id, p_type: e.type, p_provider_id: r.id ?? null });
      sendt.push(e.type);
    } catch (err) {
      // Svaret frå Resend blir logga, men går ikkje ut: det seier mellom anna om
      // domenet er verifisert, og funksjonen blir kalla frå ei heilt open side.
      console.error("bestilling-epost", e.type, String(err));
      // Angre-steget. Utan det ville e-posten vore låst ute for godt.
      await rpc("pipe_email_release", { p_order_id: id, p_type: e.type });
      feilet.push(e.type);
    }
  }

  return svar({ satt_opp: true, sendt, feilet });
});
