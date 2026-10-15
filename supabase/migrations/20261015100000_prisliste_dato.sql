-- Kva prisliste prisen kjem frå.
--
-- Prislistene frå Dahl blir importerte når dei kjem, og ei liste har sjeldan
-- med alt som ligg i katalogen. Det som ikkje var med, beheld den gamle prisen
-- utan at nokon ser det. Importen viste lista over slike varer før ein trykte,
-- men ho forsvann så snart importen var gjort.
--
-- prisliste_dato er tidspunktet for siste import varen var med i. Alle varene
-- i same import får nøyaktig same verdi (now() er tida transaksjonen starta),
-- så «ikkje med i siste prisliste» er rett og slett «prisliste_dato er ikkje
-- den største». Ei pris som blir retta for hand, rører ikkje feltet: ho kjem
-- ikkje frå ei prisliste.
--
-- Revisjonssporet loggar berre felta det er bede om, så feltet gir ingen
-- støy der.

alter table public.pipe_types add column if not exists prisliste_dato timestamptz;

comment on column public.pipe_types.prisliste_dato is
  'Tidspunktet for siste prisimport varen var med i. null = aldri med i ei prisliste.';

-- Funksjonskroppen er som i 20260831000000_prisimport_bak_tilgangsvakt.sql,
-- med to tillegg. Same signatur, så tilgangane er som før.
--
--  1. prisliste_dato = now() på kvar vare som var med.
--  2. Ei linje kan ha «bekreft»: true. Då var varen med i lista til same
--     innkjøpspris som før, og berre datoen blir sett. Appen sende før berre
--     dei endra linjene; utan dette ville ei vare med uendra pris sett ut som
--     ho mangla i lista. Prisane hennar skal heller ikkje reknast om: ein
--     salspris kontoret har retta for hand, skal stå.
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
      prisliste_dato = now()
  from _pipe_import i
  where btrim(t.sku) = i.sku;

  get diagnostics v_updated = row_count;

  -- Varenummer i fila som ikkje finst i katalogen. Grensesnittet tilbyr å
  -- opprette dei, men det skal vere eit eige, medvite val.
  select coalesce(array_agg(i.sku), '{}')
  into v_unmatched
  from _pipe_import i
  where not exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku);

  return jsonb_build_object(
    -- «updated» er varene som fekk ny pris, som før; dei stadfesta kjem i tillegg
    'updated', v_updated - (select count(*) from _pipe_import i where i.bekreft
                              and exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku)),
    'confirmed', (select count(*) from _pipe_import i where i.bekreft
                    and exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku)),
    'received', (select count(*) from _pipe_import),
    'unmatched', to_jsonb(v_unmatched)
  );
end;
$$;

revoke all on function public.pipe_import_costs(jsonb, numeric, numeric) from public, anon;
grant execute on function public.pipe_import_costs(jsonb, numeric, numeric) to authenticated;
