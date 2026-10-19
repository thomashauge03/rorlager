-- Prishopp: justeringar oppå påslaget, med spor.
--
-- Salsprisen var innkjøpspris × påslag. Når kronen svingar, vil kontoret heve
-- eller senke alle prisane med nokre prosent – utan å røre påslaget, som er
-- den faste avansen. Og dei vil i ettertid kunne sjå kor mykje over Dahl-prisen
-- dei ligg, og kvifor.
--
--   pris = innkjøpspris × (1 + påslag) × prishopp_faktor
--
-- prishopp_faktor er alle hoppa sidan siste prisliste ganga saman: +5 % og så
-- −2 % gir 1,05 × 0,98 = 1,029. Ei ny prisliste frå Dahl har alt den nye
-- valutaen i seg, så importen set faktoren tilbake til 1 på varene som fekk ny
-- innkjøpspris. Ei vare som var med i lista til uendra pris («bekreft»), blir
-- ikkje rekna om – same regel som før – og beheld då hoppet sitt òg.
--
-- pipe_prishendingar er sporet: kvar import, kvar påslagskøyring og kvart hopp,
-- med prosent, grunn, utval og kor mange varer det gjaldt. Revisjonssporet har
-- framleis kvar enkelt prisendring; dette er det samla biletet.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

alter table public.pipe_types
  add column if not exists prishopp_faktor numeric not null default 1;

comment on column public.pipe_types.prishopp_faktor is
  'Prishopp sidan siste prisliste, ganga saman (1 = ingen). Pris = innkjøp × (1 + påslag) × faktor.';

create table if not exists public.pipe_prishendingar (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text,
  -- import: ny prisliste frå Dahl. paaslag: «Oppdater prisene». hopp: prishopp.
  slag text not null check (slag in ('import', 'paaslag', 'hopp')),
  -- Påslaget for import og paaslag, hoppet for hopp
  prosent numeric,
  grunn text,
  category_id uuid references public.pipe_categories(id) on delete set null,
  -- Namnet slik det var då, så sporet står sjølv om gruppa blir omdøypt
  kategori_namn text,
  avrunding numeric,
  antall integer not null default 0
);

create index if not exists idx_pipe_prishendingar_tid on public.pipe_prishendingar (created_at desc);

alter table public.pipe_prishendingar enable row level security;

drop policy if exists "pipe_prishendingar les" on public.pipe_prishendingar;
create policy "pipe_prishendingar les" on public.pipe_prishendingar
  for select to authenticated using (public.hm_er_kontor());

-- Berre funksjonane under skriv. Eit spor ein kan rette i, er ikkje eit spor.
revoke all on public.pipe_prishendingar from public, anon, authenticated;
grant select on public.pipe_prishendingar to authenticated;

create or replace function public.pipe_prishending(
  p_slag text, p_prosent numeric, p_grunn text, p_category_id uuid, p_avrunding numeric, p_antall integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pipe_prishendingar (created_by_name, slag, prosent, grunn, category_id, kategori_namn, avrunding, antall)
  values (
    coalesce(public.hm_mitt_namn(), 'System'),
    p_slag, p_prosent, nullif(btrim(coalesce(p_grunn, '')), ''), p_category_id,
    (select name from public.pipe_categories where id = p_category_id),
    p_avrunding, coalesce(p_antall, 0)
  );
$$;

-- Berre for funksjonane i denne fila
revoke all on function public.pipe_prishending(text, numeric, text, uuid, numeric, integer) from public, anon, authenticated;

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

  update public.pipe_types t
  set price = case
        when t.cost_price is not null and (
          t.price is null or exists (
            select 1 from unnest(array[0.01, 1, 5, 10]::numeric[]) r
             where round(t.cost_price * (1 + v_paaslag / 100) * t.prishopp_faktor / r) * r = t.price
          )
        )
          then round(t.cost_price * (1 + v_paaslag / 100) * t.prishopp_faktor * v_f / v_round) * v_round
        when t.price is not null
          then round(t.price * v_f / v_round) * v_round
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
  set price = round((cost_price * (1 + p_percent / 100) * prishopp_faktor) / v_round) * v_round
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
      price = case when i.bekreft then t.price else round((i.cost * (1 + p_percent / 100)) / v_round) * v_round end,
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
