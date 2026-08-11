-- ═══════════════════════════════════════════════════════════
-- Tilgang krever nå en rad i system_users.
--
-- Før dette var HVER policy på HVER pipe_*-tabell
-- `to authenticated using (true) with check (true)`. Alle med en innlogging
-- hadde alt: lager, priser, ordrer, fakturaer og innstillinger. Og
-- selvregistrering er på i prosjektet, så den som kunne ta imot e-post kunne
-- registrere seg og få det.
--
-- Verre: de seks SECURITY DEFINER-funksjonene omgår RLS helt. De sjekket bare
-- `auth.uid() is null`, altså «er du logget inn», og en fremmed kunne dermed
-- justere lager, endre alle priser med påslag, opprette og slette fakturaer og
-- slette ordrer gjennom RPC – uansett hva policyene sa.
--
-- system_users fantes allerede, med (email, full_name, role, note), men den var
-- TOM og ble ikke lest av noen policy, funksjon eller trigger. Den var et
-- passivt register: adminbordet skrev rader dit i den tro at det ga tilgang, og
-- slettet rader i den tro at det fjernet tilgang. Ingen av delene skjedde.
--
-- Notatet i adminbordets register sa «Rollen ligger i admin_brukere». Den
-- tabellen finnes ikke i rørlageret i det hele tatt.
--
-- REKKEFØLGEN I DENNE FILA ER IKKE VILKÅRLIG. Brukeren legges inn FØR noe
-- strammes. Motsatt rekkefølge låser ut den som er innlogget nå, inkludert den
-- som skal rette det.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Dagens bruker inn, før noe strammes ──
--
-- Målt i auth.users 2026-08-12: én bekreftet konto, sist innlogget 10. august.
-- Den står også i super_admins og ville sluppet inn uansett, men raden legges
-- inn likevel: den gjør tilgangen synlig i adminbordet, og super_admins er
-- retten til å bestemme hvem ANDRE som slipper inn – ikke det samme som å være
-- bruker.

insert into public.system_users (email, full_name, role, note)
values
  ('thomashauge03@gmail.com', 'Thomas Hauge', 'admin',
   'Lagt inn da rollemodellen ble slått på. Står også i super_admins.')
on conflict (email) do nothing;


-- ── 2. Funksjonen policyene spør ──
--
-- SECURITY DEFINER fordi den leser system_users, som bare en super admin har
-- leserett til. Uten definer ville hver policy kalt en funksjon som selv blir
-- stoppet av en policy – en rekursjon Postgres avviser.
--
-- Nøkkelen er E-POSTEN fra JWT-en, ikke auth.uid(). Det er en bevisst
-- videreføring av mønsteret i is_super_admin(): en rad kan legges inn FØR
-- personen har registrert seg, og virker fra første innlogging. Med auth-id som
-- nøkkel måtte kontoen finnes først.

create or replace function public.hm_har_tilgang()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.system_users
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) or public.is_super_admin();
$$;

comment on function public.hm_har_tilgang() is
  'Har den innloggede tilgang til admindelen? Rad i system_users, eller super admin. Brukes av hver policy og hver SECURITY DEFINER-funksjon.';

-- anon har ingenting å gjøre her: kundeflyten går på egne policyer og på
-- pipe_submit_order, som med vilje står uten vakt.
revoke all on function public.hm_har_tilgang() from public;
grant execute on function public.hm_har_tilgang() to authenticated;


/*
 * Rollen, til visning og til framtidig avgrensning per tabell.
 *
 * MERK: rollen avgrenser ingenting ennå. 'admin', 'kontor' og 'lager' har i dag
 * samme tilgang, og det er sant framfor å late som noe annet. Å skille dem
 * krever en beslutning om hva en lagerarbeider IKKE skal se, og den er ikke
 * tatt.
 */
create or replace function public.hm_rolle()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin() then 'super_admin'
    else (
      select role from public.system_users
       where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       limit 1
    )
  end;
$$;

comment on function public.hm_rolle() is
  'Rollen til den innloggede: super_admin, eller role fra system_users. Null uten tilgang. Avgrenser ingenting ennå.';

revoke all on function public.hm_rolle() from public;
grant execute on function public.hm_rolle() to authenticated;


-- ── 2b. Den ene funksjonen som ikke er plpgsql ──
--
-- pipe_missing_cost_count er en sql-funksjon, så det går ikke å legge inn en
-- `raise` i den. Vakta blir en case i stedet: uten tilgang gir den null, ikke
-- et tall. Lekkasjen var liten – hvor mange rørtyper som mangler innkjøpspris –
-- men den var der, og den var gratis å lukke.

create or replace function public.pipe_missing_cost_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.hm_har_tilgang()
      then (select count(*)::integer from public.pipe_types where cost_price is null)
    else null
  end;
$$;


-- ═══════════════════════════════════════════════════════════
-- 3. SECURITY DEFINER-funksjonene
--
-- Disse omgår RLS. Uten vakt her ville policyene under vært uten virkning:
-- en fremmed som registrerer seg kunne justere lager, endre alle priser,
-- opprette og slette fakturaer og slette ordrer gjennom RPC uten å røre en
-- tabell direkte.
--
-- Kroppene er hentet ordrett fra basen og bare fått vakta byttet eller lagt
-- inn. Ingen logikk er endret.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pipe_adjust_stock(p_pipe_type_id uuid, p_change numeric, p_reason text DEFAULT 'justering'::text, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance numeric;
  v_name text;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Endringen må være forskjellig fra null';
  end if;

  update public.pipe_types
    set stock = stock + p_change
    where id = p_pipe_type_id
    returning stock, name into v_balance, v_name;

  if not found then
    raise exception 'Ukjent rørtype';
  end if;

  insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
  values (p_pipe_type_id, v_name, p_change, v_balance, coalesce(p_reason, 'justering'), p_note, auth.uid());

  return v_balance;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_apply_markup(p_percent numeric, p_category_id uuid DEFAULT NULL::uuid, p_pipe_type_ids uuid[] DEFAULT NULL::uuid[], p_round_to numeric DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_round numeric;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_percent is null or p_percent < 0 then
    raise exception 'Påslaget må være null eller høyere';
  end if;
  if p_percent > 1000 then
    raise exception 'Påslaget er urimelig høyt';
  end if;

  -- Avrunding til 0 ville gitt divisjon på null lenger nede
  v_round := coalesce(nullif(p_round_to, 0), 1);

  update public.pipe_types
  set price = round((cost_price * (1 + p_percent / 100)) / v_round) * v_round
  where cost_price is not null
    and (p_category_id is null or category_id = p_category_id)
    and (p_pipe_type_ids is null or id = any(p_pipe_type_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_create_invoice(p_customer_name text, p_period_from date, p_period_to date, p_order_ids uuid[], p_total numeric, p_note text DEFAULT NULL::text)
 RETURNS pipe_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invoice public.pipe_invoices;
  v_already int;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'Ingen bestillinger valgt';
  end if;
  if p_period_from is null or p_period_to is null then
    raise exception 'Både fra- og til-dato må fylles ut';
  end if;

  -- Ei bestilling skal aldri hamne på to grunnlag. Sjekken ligg her og ikkje
  -- berre i grensesnittet, i tilfelle to faner blir brukte samtidig.
  select count(*) into v_already
  from public.pipe_orders
  where id = any(p_order_ids) and invoice_id is not null;

  if v_already > 0 then
    raise exception '% av bestillingene er allerede fakturert', v_already;
  end if;

  insert into public.pipe_invoices (customer_name, period_from, period_to, total, note)
  values (p_customer_name, p_period_from, p_period_to, coalesce(p_total, 0), p_note)
  returning * into v_invoice;

  update public.pipe_orders
  set invoice_id = v_invoice.id
  where id = any(p_order_ids);

  return v_invoice;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_delete_invoice(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  update public.pipe_orders set invoice_id = null where invoice_id = p_id;
  delete from public.pipe_invoices where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_delete_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record;
  v_balance numeric;
  v_number bigint;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select order_number into v_number from public.pipe_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  for v_line in
    select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_order_id
  loop
    if v_line.pipe_type_id is not null then
      update public.pipe_types set stock = stock + v_line.quantity
        where id = v_line.pipe_type_id
        returning stock into v_balance;

      insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
      values (v_line.pipe_type_id, v_line.name, v_line.quantity, v_balance, 'sletting',
              'Slettet bestilling #' || v_number, auth.uid());
    end if;
  end loop;

  delete from public.pipe_orders where id = p_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_set_stock(p_pipe_type_id uuid, p_stock numeric, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old numeric;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select stock into v_old from public.pipe_types where id = p_pipe_type_id;
  if not found then
    raise exception 'Ukjent rørtype';
  end if;

  if v_old = p_stock then
    return v_old;
  end if;

  return public.pipe_adjust_stock(p_pipe_type_id, p_stock - v_old, 'opptelling', p_note);
end;
$function$
;

-- ═══════════════════════════════════════════════════════════
-- 4. Policyene
--
-- ALTER framfor DROP + CREATE: ingen glippe der tabellen står uten policy.
-- Bare klausulene som finnes endres – en INSERT-policy har bare with check.
-- Lista er generert fra pg_policies, ikke skrevet fra hukommelsen.
--
-- De offentlige policyene står URØRT. En anonym forespørsel kan bare bruke
-- {public}-policyer, så å stramme authenticated-policyene kan ikke røre
-- kundeflyten.
-- ═══════════════════════════════════════════════════════════

alter policy "pipe_categories admin" on public.pipe_categories
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_invoices admin" on public.pipe_invoices
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_order_lines admin" on public.pipe_order_lines
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_orders admin" on public.pipe_orders
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_settings admin" on public.pipe_settings
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_stock_log admin" on public.pipe_stock_log
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_types admin" on public.pipe_types
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());
