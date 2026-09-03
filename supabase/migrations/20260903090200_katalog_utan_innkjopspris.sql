-- ═══════════════════════════════════════════════════════════
-- Innkjøpsprisen ut av det offentlige.
--
-- Verifisert mot den levende basen 3. september 2026, med anon-nøkkelen og
-- uten innlogging:
--
--   GET /rest/v1/pipe_types?select=name,price,cost_price   ->  200
--       Overvannsrør X-Stream SN8   price 103   cost_price 66.7
--   GET /rest/v1/pipe_settings?select=markup_percent       ->  200
--       markup_percent 55
--
-- Enhver besøkende kunne lese netto innkjøpspris fra Dahl og påslaget, og
-- dermed regne ut dekningsbidraget per meter.
--
-- Dette er eldre enn prosjektdelen – «pipe_types read» har stått som
-- `for select using (true)` siden 20260810100000_rorlager_init.sql. Men det
-- rettes her, fordi rollen 'prosjekt' ellers ville vært ren pynt: en
-- byggeplassbruker som ikke skal se innkjøpspriser kunne bare logget ut og lest
-- dem som anonym.
--
--
-- HVORFOR EN VISNING OG IKKE KOLONNERETTIGHETER
--
-- RLS er radbasert og kan ikke skjule en kolonne. Kolonnerettigheter kan, men
-- de deles ut per databaserolle, og både kontorbrukeren og prosjektbrukeren er
-- `authenticated` – de kan altså ikke skilles der. En visning uten kolonnen er
-- det eneste som treffer riktig.
--
-- Visningen kjører med eierens rettigheter (security_invoker er av som
-- standard) og går derfor utenom RLS på pipe_types. Det er nettopp poenget, og
-- det er trygt her: visningen har ingen rader som skal skjules for noen. Hele
-- katalogen er offentlig – det er de to tallene som ikke er det.
--
-- Ingen where-klausul, så utvalget er nøyaktig som før. `active` er med som
-- kolonne og filtreres i klienten, slik det alltid har blitt gjort.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Katalogen, uten cost_price ──

create or replace view public.pipe_catalog as
  select
    id, category_id, name, dimension, sku, qr_slug, unit,
    price, stock, low_stock_threshold, location, color, description,
    active, sort_order, created_at, updated_at
  from public.pipe_types;

comment on view public.pipe_catalog is
  'Katalogen slik kunder og prosjektbrukere ser den. cost_price er med vilje ikke med – den er kontorets. Kjører med eierens rettigheter, så den når fram uten lesepolicy på pipe_types.';


-- ── 2. Innstillingene, uten markup_percent ──

create or replace view public.pipe_public_settings as
  select
    id, company_name, org_number, address, phone, email,
    intro_text, pickup_note, show_prices, require_phone, require_signature,
    vat_rate, updated_at
  from public.pipe_settings;

comment on view public.pipe_public_settings is
  'Innstillingene kundeflyten trenger. markup_percent er ikke med – påslaget er ikke kundens sak.';


-- ── 3. Steng basistabellene ──
--
-- Rekkefølgen er med vilje: visningene finnes FØR lesetilgangen tas bort, så
-- det ikke er et øyeblikk der katalogen er utilgjengelig for kundeflyten.

/*
 * REKKEFØLGEN ER IKKE VALGFRI: revoke FØR grant.
 *
 * `grant select` legger bare til. Supabase har
 * `alter default privileges in schema public grant all on tables to anon`, og
 * det gjelder VISNINGER også — så anon fikk hele settet i det visningen ble
 * opprettet:
 *
 *   pipe_catalog: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,...}
 *
 * En visning uten security_invoker kjører med eierens rettigheter, og eieren
 * er `postgres` med rolbypassrls. Det gjelder ikke bare lesing: en anonym
 * `DELETE FROM pipe_catalog` slo rett gjennom til pipe_types og tømte
 * katalogen. Verifisert mot en base bygd fra disse migrasjonene — 0 rader
 * igjen — og PostgREST ville rutet det som ett kall med den offentlige
 * anon-nøkkelen.
 *
 * Visningen skal bare kunne LESES. Da må alt annet tas bort først.
 */
revoke all on public.pipe_catalog         from anon, authenticated;
revoke all on public.pipe_public_settings from anon, authenticated;

grant select on public.pipe_catalog         to anon, authenticated;
grant select on public.pipe_public_settings to anon, authenticated;

-- `revoke select` alene ville latt INSERT, UPDATE, DELETE og TRUNCATE stå
-- igjen. RLS stopper de tre første, men RLS dekker ikke TRUNCATE.
revoke all on public.pipe_types    from anon;
revoke all on public.pipe_settings from anon;

-- Samme mangel fra 20260810100100: disse to fikk aldri noen tilbaketrekking.
-- Å tømme dem ville låst ute hele kontoret.
revoke all on public.system_users from anon;
revoke all on public.super_admins from anon;

-- Kategoriene SKAL være lesbare for kunden, men satt igjen med hele settet
-- (INSERT, UPDATE, DELETE, TRUNCATE) fordi de ikke trengte en visning. Samme
-- resonnement som over: RLS stopper de tre første, men ikke TRUNCATE.
revoke all on public.pipe_categories from anon;
grant select on public.pipe_categories to anon;

-- Policyene som slapp alle inn. Etter dette er det bare «pipe_types admin» og
-- «pipe_settings admin» igjen, og de spør hm_har_tilgang() – som nå betyr
-- kontoret. Prosjektbrukeren leser katalogen gjennom visningen som alle andre.
drop policy if exists "pipe_types read"    on public.pipe_types;
drop policy if exists "pipe_settings read" on public.pipe_settings;


-- ── 4. Sekvensen anon ikke trenger ──
--
-- `grant usage, select on sequence pipe_orders_order_number_seq to anon` sto i
-- init-migrasjonen. Innsettingen skjer inne i pipe_submit_order, som er
-- SECURITY DEFINER og kjører med eierens rettigheter, så anon har aldri trengt
-- den. `select` på sekvensen røper hvor mange uttak bedriften har hatt.
--
-- Jeg har ikke klart å vise en utnyttelsesvei gjennom PostgREST, så dette er
-- ryddighet, ikke en tetting av noe åpent. Men grunnrettigheten er feil, og
-- `setval` fra rå SQL ville rotet til nummerserien.

-- Berre pipe_*-sekvensene her. Prosjektsekvensene blir trukket tilbake i
-- migrasjonen som oppretter dem — en fil skal ikke kunne feile på et objekt
-- den ikke selv lager.
revoke all on sequence public.pipe_orders_order_number_seq     from anon;
revoke all on sequence public.pipe_invoices_invoice_number_seq from anon;
