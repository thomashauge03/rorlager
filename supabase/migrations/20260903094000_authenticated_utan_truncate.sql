-- Tredje runde: det Supabase gir bort til «authenticated», og tal som ikkje er tal.
--
-- BAKGRUNN
--
-- Supabase køyrer `alter default privileges in schema public grant all on
-- tables to anon, authenticated`. «all» er ikkje select/insert/update/delete –
-- det er òg TRUNCATE, REFERENCES, TRIGGER og MAINTAIN.
--
-- Migrasjonane hittil har trekt dette tilbake frå anon, og resonnementet står
-- skrive i dei: «RLS stoppar dei tre første, men RLS dekkjer ikkje TRUNCATE».
-- Det er rett. Det stoppa berre eitt steg for tidleg: authenticated fekk behalde
-- heile settet, og authenticated er i denne modellen kven som helst som har
-- registrert seg – sjølvregistrering er open, og ein konto utan rad i
-- system_users har ingen tilgang, men han ER authenticated.
--
--   truncate public.system_users cascade;   -- heile tilgangsmodellen borte
--   truncate public.pipe_types cascade;     -- heile katalogen borte
--   select setval('public.projects_project_number_seq', 9999);
--
-- RLS ser ingen av dei: TRUNCATE går utanom policyar, og setval krev UPDATE på
-- sekvensen, ikkje SELECT – og det var berre SELECT som blei trekt.
--
-- PostgREST sender aldri TRUNCATE eller setval, så dette er ein liggjande
-- rettigheit og ikkje ein open veg inn. Det er likevel presis den rettigheita
-- ingen har bruk for, og ho kostar ingenting å ta bort.

-- ═══════════════════════════════════════════════════════════════════
--  Tabellane: berre dei fire rettigheitene appen faktisk brukar
-- ═══════════════════════════════════════════════════════════════════
--
-- RLS avgjer framleis kva rader kvar av dei når. Dette avgjer berre kva
-- verb som finst.

do $$
declare
  t text;
begin
  foreach t in array array[
    'pipe_categories', 'pipe_types', 'pipe_settings', 'pipe_orders',
    'pipe_order_lines', 'pipe_invoices', 'pipe_stock_log',
    'system_users', 'super_admins',
    'projects', 'project_members', 'project_orders', 'project_order_lines',
    'project_receipts', 'project_receipt_lines', 'project_receipt_photos'
  ]
  loop
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════
--  Sekvensane: UPDATE er setval
-- ═══════════════════════════════════════════════════════════════════
--
-- SELECT blei trekt i førre runde fordi eit nummer fortel kor mange
-- bestillingar huset har. UPDATE er verre: med han kan kven som helst innlogga
-- skru nummerserien framover, eller bakover så to bestillingar får same nummer.
-- USAGE blir ståande – nextval er det kontoret treng når det legg inn direkte.

do $$
declare
  s text;
begin
  foreach s in array array[
    'projects_project_number_seq',
    'project_orders_order_number_seq',
    'project_receipts_receipt_number_seq',
    'pipe_orders_order_number_seq',
    'pipe_invoices_invoice_number_seq'
  ]
  loop
    if to_regclass('public.' || s) is not null then
      execute format('revoke update on sequence public.%I from public, anon, authenticated', s);
    end if;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════
--  Dei to funksjonane ingen hadde trekt
-- ═══════════════════════════════════════════════════════════════════
--
-- Ingen av dei er SECURITY DEFINER, og ingen av dei gjer noko: triggeren
-- nektar å bli kalla direkte, og slugifyen er ein rein strengfunksjon. Dei blir
-- trekte fordi ei oppteljing som ikkje går heilt opp, sluttar å bli lesen.

revoke all on function public.pipe_touch_updated_at() from public, anon;
revoke all on function public.pipe_slugify(text) from public, anon;

-- ═══════════════════════════════════════════════════════════════════
--  NaN er ikkje eit antal
-- ═══════════════════════════════════════════════════════════════════
--
-- Postgres sorterer NaN som det STØRSTE numeriske talet. Difor er «NaN <= 0»
-- usant, «NaN > 0» sant, og både vakta i funksjonane og CHECK-en på kolonnen
-- slepp han gjennom. Verre: statusutrekninga spør «mottatt < bestilt», og
-- NaN < 10 er usant – så ei bestilling der det kom «NaN» av ei vare, står som
-- fullt mottatt.
--
-- Infinity er same historia. Begge kjem inn som JSON-strengar, som numeric
-- godtek: '{"received_qty":"NaN"}'.

alter table public.project_order_lines
  drop constraint if exists project_order_lines_requested_qty_check;
alter table public.project_order_lines
  add constraint project_order_lines_requested_qty_check
  check (requested_qty > 0 and requested_qty < 'Infinity'::numeric);

alter table public.project_order_lines
  drop constraint if exists project_order_lines_ordered_qty_check;
alter table public.project_order_lines
  add constraint project_order_lines_ordered_qty_check
  check (ordered_qty is null or (ordered_qty >= 0 and ordered_qty < 'Infinity'::numeric));

alter table public.project_receipt_lines
  drop constraint if exists project_receipt_lines_received_qty_check;
alter table public.project_receipt_lines
  add constraint project_receipt_lines_received_qty_check
  check (received_qty >= 0 and received_qty < 'Infinity'::numeric);

-- ═══════════════════════════════════════════════════════════════════
--  project_recompute_status: vakta inn i kroppen
-- ═══════════════════════════════════════════════════════════════════
--
-- Funksjonen er SECURITY DEFINER og har ingen vakt i det heile – det einaste
-- som held han stengd, er «revoke execute» frå førre runde. Det held i dag, og
-- «create or replace» tek vare på rettigheitene. Men ein «drop» + «create» i ein
-- seinare migrasjon ville stille gitt han tilbake til anon og authenticated,
-- gjennom nettopp dei default privileges denne fila handlar om.
--
-- Ei linje i kroppen overlever det.

create or replace function public.project_recompute_status(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_prosjekt uuid;
  v_bestilte integer;
  v_uferdige integer;
  v_motteke integer;
begin
  select status, project_id into v_status, v_prosjekt
    from public.project_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  -- ── DET EINASTE SOM ER NYTT I DENNE FUNKSJONEN ──
  -- Kontoret, eller nokon som høyrer prosjektet til: same krins som resten av
  -- skrivevegane inn på ei bestilling. Same melding som dei andre, så han ikkje
  -- fortel skilnaden på «finst ikkje» og «ikkje din».
  if not public.hm_er_kontor()
     and not exists (
       select 1 from public.project_members m
        where m.project_id = v_prosjekt
          and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
     )
  then
    raise exception 'Fant ikke bestillingen';
  end if;

  -- 'meldt' og 'avvist' ligg før leveransen og skal ikkje rørast her
  if v_status in ('meldt', 'avvist') then
    return v_status;
  end if;

  select count(*) into v_bestilte
    from public.project_order_lines
   where order_id = p_order_id and coalesce(ordered_qty, 0) > 0;

  if v_bestilte = 0 then
    return v_status;
  end if;

  select
    count(*) filter (where mottatt < l.ordered_qty),
    count(*) filter (where mottatt > 0)
    into v_uferdige, v_motteke
  from public.project_order_lines l
  cross join lateral (
    select coalesce(sum(rl.received_qty), 0) as mottatt
      from public.project_receipt_lines rl
      join public.project_receipts r on r.id = rl.receipt_id
     where rl.order_line_id = l.id and r.order_id = p_order_id
  ) s
  where l.order_id = p_order_id and coalesce(l.ordered_qty, 0) > 0;

  v_status := case
    when v_uferdige = 0 then 'mottatt'
    when v_motteke > 0 then 'delvis'
    else 'bestilt'
  end;

  update public.project_orders set status = v_status where id = p_order_id;
  return v_status;
end;
$$;

revoke all on function public.project_recompute_status(uuid) from public, anon, authenticated;
