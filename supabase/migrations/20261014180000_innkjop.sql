-- Innkjøpsforslag: kva som må bestillast hos Dahl, og kor mykje.
--
-- Forbruket per vare er det som har gått ut av lageret dei siste N dagane, med
-- returar og retting trekt frå – netto. Rekna her og ikkje i nettlesaren:
-- lagerloggen kan ha titusenvis av rader, og svaret er éi rad per vare.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

create or replace function public.pipe_forbruk_per_vare(p_dagar integer default 90)
returns table (pipe_type_id uuid, forbruk numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_dagar is null or p_dagar < 1 or p_dagar > 730 then
    raise exception 'Velg mellom 1 og 730 dager';
  end if;

  -- Ut av lageret: uttak og godkjende bestillingar ('bestilling'), uttak i
  -- panelet ('uttak'), retting av uttak ('retting'). Tilbake: 'retur', og
  -- 'sletting' av ein ordre. Påfyll og opptelling er ikkje forbruk.
  return query
    select l.pipe_type_id, -sum(l.change)
      from public.pipe_stock_log l
     where l.pipe_type_id is not null
       and l.created_at > now() - make_interval(days => p_dagar)
       and l.reason in ('bestilling', 'uttak', 'retting', 'retur', 'sletting')
     group by l.pipe_type_id
    having -sum(l.change) > 0;
end;
$$;

revoke all on function public.pipe_forbruk_per_vare(integer) from public, anon;
grant execute on function public.pipe_forbruk_per_vare(integer) to authenticated;
