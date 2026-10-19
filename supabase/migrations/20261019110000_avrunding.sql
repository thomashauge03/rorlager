-- Avrunding som innstilling, og «alltid opp».
--
-- Avrundinga var eit val i kvar dialog, og vanleg avrunding til næraste. Med
-- 35 % avanse og avrunding til næraste krone kunne ei vare enda under 35 %
-- (85,40 → 85). Kontoret vil ha runde salsprisar som aldri ligg under avansen.
--
--   price_round_to   trinnet: 0,01 (øre), 1, 5 eller 10 kroner
--   price_round_up   true = alltid opp til neste trinn, false = næraste
--
-- Trinnet blir framleis sendt med frå appen (dialogane startar på det lagra);
-- retninga blir lesen her, så ingen funksjonssignatur blir endra og ein eldre
-- app held fram å virke.
--
-- Funksjonane er som i 20261019100000_prishopp.sql. Einaste skilnaden er at
-- avrundinga går gjennom pipe_rund_pris, og at «fylgjer formelen» i
-- prishoppet godtek både næraste og opp.
--
-- Må tole å bli køyrd om att.

alter table public.pipe_settings
  add column if not exists price_round_to numeric not null default 1,
  add column if not exists price_round_up boolean not null default true;

alter table public.pipe_settings drop constraint if exists pipe_settings_price_round_to_check;
alter table public.pipe_settings
  add constraint pipe_settings_price_round_to_check check (price_round_to in (0.01, 1, 5, 10));

comment on column public.pipe_settings.price_round_to is 'Trinnet salsprisen blir runda til: 0,01, 1, 5 eller 10 kr.';
comment on column public.pipe_settings.price_round_up is 'true = alltid opp til neste trinn, så prisen aldri ligg under avansen.';

-- Revisjonssporet skal ha med dei nye felta
drop trigger if exists trg_revisjon_pipe_settings on public.pipe_settings;
create trigger trg_revisjon_pipe_settings
  after update on public.pipe_settings
  for each row execute function public.pipe_revisjon_logg(
    'company_name,org_number,address,phone,email,show_prices,require_phone,require_signature,vat_rate,markup_percent,price_round_to,price_round_up,accept_orders,order_email,payment_terms_days,stock_project_id', 'company_name');

-- Rundar av til trinnet, opp eller til næraste. Trinn 0 eller null = heile kroner.
create or replace function public.pipe_rund_pris(p_verdi numeric, p_steg numeric, p_opp boolean)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_verdi is null then null
    when coalesce(p_opp, false) then ceil(p_verdi / coalesce(nullif(p_steg, 0), 1)) * coalesce(nullif(p_steg, 0), 1)
    else round(p_verdi / coalesce(nullif(p_steg, 0), 1)) * coalesce(nullif(p_steg, 0), 1)
  end;
$$;

-- Retninga frå innstillingane. Manglar rada, er det vanleg avrunding som før.
create or replace function public.pipe_rund_opp()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select price_round_up from public.pipe_settings where id = 1), false);
$$;

revoke all on function public.pipe_rund_opp() from public, anon;
grant execute on function public.pipe_rund_opp() to authenticated;

-- ============================================================================
--  Prishopp
--
--  p_prosent      +5 = fem prosent opp, −2 = to prosent ned
--  p_grunn        kvifor – står i sporet
--  p_category_id  avgrens til éi varegruppe, null = alle
--  p_round_to     rund av til nærmaste (1 = heile kroner)
--
--  Ei vare som fylgjer formelen, blir rekna frå innkjøpsprisen med den nye
--  faktoren, så avrundinga ikkje hopar seg opp hopp for hopp. Ei vare med
--  pris sett for hand – eller utan innkjøpspris – får hoppet på prisen ho har.
--  Returnerer talet på varer som fekk hoppet.
-- ============================================================================
create or replace function public.pipe_prishopp(
  p_prosent numeric,
  p_grunn text,
  p_category_id uuid default null,
  p_round_to numeric default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_round numeric;
  v_paaslag numeric;
  v_f numeric;
  v_opp boolean;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_prosent is null or p_prosent = 0 then
    raise exception 'Prishoppet kan ikke være 0 %%';
  end if;
  if p_prosent < -50 or p_prosent > 100 then
    raise exception 'Prishoppet må være mellom -50 og 100 %%';
  end if;
  if nullif(btrim(coalesce(p_grunn, '')), '') is null then
    raise exception 'Skriv hvorfor prisene justeres';
  end if;
  if length(p_grunn) > 200 then
    raise exception 'Grunnen kan være på høyst 200 tegn';
  end if;

  v_round := coalesce(nullif(p_round_to, 0), 1);
  v_f := 1 + p_prosent / 100;
  select coalesce(markup_percent, 0) into v_paaslag from public.pipe_settings where id = 1;
  v_paaslag := coalesce(v_paaslag, 0);
  v_opp := public.pipe_rund_opp();

  update public.pipe_types t
  set price = case
        when t.cost_price is not null and (
          t.price is null or exists (
            select 1 from unnest(array[0.01, 1, 5, 10]::numeric[]) r
             where t.price in (round(t.cost_price * (1 + v_paaslag / 100) * t.prishopp_faktor / r) * r, ceil(t.cost_price * (1 + v_paaslag / 100) * t.prishopp_faktor / r) * r)
          )
        )
          then public.pipe_rund_pris(t.cost_price * (1 + v_paaslag / 100) * t.prishopp_faktor * v_f, v_round, v_opp)
        when t.price is not null
          then public.pipe_rund_pris(t.price * v_f, v_round, v_opp)
        else null
      end,
      prishopp_faktor = t.prishopp_faktor * v_f
  where (t.price is not null or t.cost_price is not null)
    and (p_category_id is null or t.category_id = p_category_id);

  get diagnostics v_count = row_count;
  perform public.pipe_prishending('hopp', p_prosent, p_grunn, p_category_id, v_round, v_count);
  return v_count;
end;
$$;

revoke all on function public.pipe_prishopp(numeric, text, uuid, numeric) from public, anon;
grant execute on function public.pipe_prishopp(numeric, text, uuid, numeric) to authenticated;

-- ============================================================================
--  «Oppdater prisene»: som før, men hoppa står. Utan faktoren ville eit nytt
--  påslag stille viska ut kvart prishopp sidan siste prisliste.
-- ============================================================================
create or replace function public.pipe_apply_markup(
  p_percent numeric,
  p_category_id uuid default null,
  p_pipe_type_ids uuid[] default null,
  p_round_to numeric default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_round numeric;
  v_opp boolean := public.pipe_rund_opp();
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
  set price = public.pipe_rund_pris(cost_price * (1 + p_percent / 100) * prishopp_faktor, v_round, v_opp)
  where cost_price is not null
    and (p_category_id is null or category_id = p_category_id)
    and (p_pipe_type_ids is null or id = any(p_pipe_type_ids));

  get diagnostics v_count = row_count;
  perform public.pipe_prishending('paaslag', p_percent, null, p_category_id, v_round, v_count);
  return v_count;
end;
$$;

revoke all on function public.pipe_apply_markup(numeric, uuid, uuid[], numeric) from public, anon;
grant execute on function public.pipe_apply_markup(numeric, uuid, uuid[], numeric) to authenticated;

-- ============================================================================
--  Prisimport: som i 20261015100000_prisliste_dato.sql, men ny innkjøpspris
--  nullstiller prishoppet, og importen står i sporet.
-- ============================================================================
create or replace function public.pipe_import_costs(
  p_rows jsonb,
  p_percent numeric,
  p_round_to numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round numeric;
  v_updated integer;
  v_confirmed integer;
  v_unmatched text[];
  v_opp boolean := public.pipe_rund_opp();
begin
  -- Same vakt som dei andre skrivefunksjonane. auth.uid() aleine er ikkje nok:
  -- innlogga og autorisert er to ulike ting når kven som helst kan registrere seg.
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Ingen varelinjer å importere';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'For mange varelinjer i én import';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 1000 then
    raise exception 'Ugyldig påslag';
  end if;

  v_round := coalesce(nullif(p_round_to, 0), 1);

  -- Tabellen kan liggje att frå ein eldre versjon utan bekreft-kolonnen
  drop table if exists _pipe_import;
  create temporary table _pipe_import (sku text primary key, cost numeric, bekreft boolean not null default false) on commit drop;

  insert into _pipe_import (sku, cost, bekreft)
  select btrim(r ->> 'sku'), (r ->> 'cost')::numeric, coalesce((r ->> 'bekreft')::boolean, false)
  from jsonb_array_elements(p_rows) r
  where btrim(coalesce(r ->> 'sku', '')) <> ''
    and ((r ->> 'cost')::numeric > 0 or coalesce((r ->> 'bekreft')::boolean, false))
  on conflict (sku) do nothing;

  update public.pipe_types t
  set cost_price = case when i.bekreft then t.cost_price else i.cost end,
      price = case when i.bekreft then t.price else public.pipe_rund_pris(i.cost * (1 + p_percent / 100), v_round, v_opp) end,
      prishopp_faktor = case when i.bekreft then t.prishopp_faktor else 1 end,
      prisliste_dato = now()
  from _pipe_import i
  where btrim(t.sku) = i.sku;

  get diagnostics v_updated = row_count;

  select count(*) into v_confirmed
    from _pipe_import i
   where i.bekreft and exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku);

  -- Varenummer i fila som ikkje finst i katalogen. Grensesnittet tilbyr å
  -- opprette dei, men det skal vere eit eige, medvite val.
  select coalesce(array_agg(i.sku), '{}')
  into v_unmatched
  from _pipe_import i
  where not exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku);

  perform public.pipe_prishending('import', p_percent, null, null, v_round, v_updated - v_confirmed);

  return jsonb_build_object(
    -- «updated» er varene som fekk ny pris, som før; dei stadfesta kjem i tillegg
    'updated', v_updated - v_confirmed,
    'confirmed', v_confirmed,
    'received', (select count(*) from _pipe_import),
    'unmatched', to_jsonb(v_unmatched)
  );
end;
$$;

revoke all on function public.pipe_import_costs(jsonb, numeric, numeric) from public, anon;
grant execute on function public.pipe_import_costs(jsonb, numeric, numeric) to authenticated;
