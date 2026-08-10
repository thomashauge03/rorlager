-- Import av prisliste frå grossist.
--
-- Nøkkelen er varenummeret (sku). Namn, dimensjon, hylleplass og beholdning blir
-- IKKJE rørte: admin kan ha retta dei for hand, og ei prisoppdatering skal ikkje
-- skrive over det arbeidet. Det einaste som blir endra er innkjøpsprisen og
-- salsprisen som følgjer av han.
--
-- Alt skjer i éin operasjon. 156 enkeltoppdateringar frå nettlesaren ville teke
-- lang tid og kunne stoppa halvvegs, og då hadde halve katalogen hatt nye prisar
-- og halve gamle – utan at nokon visste kvar grensa gjekk.

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
  if auth.uid() is null then
    raise exception 'Krever innlogging';
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

  create temporary table if not exists _pipe_import (sku text primary key, cost numeric) on commit drop;
  delete from _pipe_import;

  insert into _pipe_import (sku, cost)
  select btrim(r ->> 'sku'), (r ->> 'cost')::numeric
  from jsonb_array_elements(p_rows) r
  where btrim(coalesce(r ->> 'sku', '')) <> ''
    and (r ->> 'cost')::numeric > 0
  on conflict (sku) do nothing;

  update public.pipe_types t
  set cost_price = i.cost,
      price = round((i.cost * (1 + p_percent / 100)) / v_round) * v_round
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
    'updated', v_updated,
    'received', (select count(*) from _pipe_import),
    'unmatched', to_jsonb(v_unmatched)
  );
end;
$$;

revoke all on function public.pipe_import_costs(jsonb, numeric, numeric) from public, anon;
grant execute on function public.pipe_import_costs(jsonb, numeric, numeric) to authenticated;
