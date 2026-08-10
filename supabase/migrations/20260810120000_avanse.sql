-- Avanse: påslaget frå innkjøpspris til salspris.
--
-- Prislista frå grossisten er netto innkjøpspris. Salsprisen er den same
-- rekneoperasjonen på kvar einaste vare, og skal difor styrast eitt sted i
-- staden for å tastast inn 156 gonger.
--
-- Prisen blir REKNA UT OG LAGRA, ikkje utleidd ved lesing. Det er med vilje:
-- pipe_submit_order slår opp prisen i pipe_types når ei bestilling kjem inn, og
-- ei ordrelinje skal for alltid vise prisen som gjaldt den dagen. Blei prisen
-- rekna ut på nytt ved kvar visning, ville gamle bestillingar endra seg kvar
-- gong påslaget blei justert.

alter table public.pipe_settings
  add column if not exists markup_percent numeric not null default 25;

comment on column public.pipe_settings.markup_percent is
  'Standard påslag i prosent frå cost_price til price. Brukt av pipe_apply_markup.';

-- ============================================================================
--  Rekn ut prisane på nytt
--
--  p_percent      påslag i prosent (25 = 25 % på innkjøpsprisen)
--  p_category_id  avgrens til éi varegruppe, null = alle
--  p_pipe_type_ids avgrens til utvalde varer, null = alle
--  p_round_to     rund av til nærmaste (1 = heile kroner, 0.01 = øre)
--
--  Returnerer talet på varer som fekk ny pris.
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
  if auth.uid() is null then
    raise exception 'Krever innlogging';
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
$$;

revoke all on function public.pipe_apply_markup(numeric, uuid, uuid[], numeric) from public, anon;
grant execute on function public.pipe_apply_markup(numeric, uuid, uuid[], numeric) to authenticated;

-- Kor mange varer som manglar innkjøpspris, og difor ikkje blir med på
-- utrekninga. Grensesnittet må kunne seie frå om det i staden for å la dei
-- stå att med gammal pris utan forklaring.
create or replace function public.pipe_missing_cost_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.pipe_types where cost_price is null;
$$;

revoke all on function public.pipe_missing_cost_count() from public, anon;
grant execute on function public.pipe_missing_cost_count() to authenticated;
