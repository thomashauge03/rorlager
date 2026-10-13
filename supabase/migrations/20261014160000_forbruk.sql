-- Forbruk per prosjekt: kva som er teke frå lageret til kvar jobb, og kva det
-- kosta.
--
-- To delar:
--
-- 1. Kostprisen på kvar uttakslinje, slik han var då røret gjekk ut av hylla.
--    Kostprisen på vara blir endra kvar gong det kjem ny prisliste frå Dahl;
--    utan ein kopi på linja ville etterkalkylen for ein jobb i fjor endra seg
--    med prislista i år. Ein trigger set han – same grunn som lagerprosjektet
--    (20261014120000): alle innsendingsvegane får det utan å hugse det.
--
-- 2. pipe_prosjekt_uttak(): uttaka på eitt prosjekt for dei som er med på det,
--    utan prisar. Byggjeplassen ser då kva som er henta frå lageret til jobben,
--    utan å få lese pipe_orders, som er kontoret sitt.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

-- ── 1. Kostprisen på linja ──

alter table public.pipe_order_lines add column if not exists unit_cost numeric;

comment on column public.pipe_order_lines.unit_cost is
  'Kostprisen på vara då linja blei skriven (eller fekk ny vare). Berre for kontoret – aldri i kvitteringa.';

create or replace function public.pipe_order_lines_kostpris()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pipe_type_id is null then
    new.unit_cost := null;
  elsif tg_op = 'INSERT' or new.pipe_type_id is distinct from old.pipe_type_id then
    new.unit_cost := (select cost_price from public.pipe_types where id = new.pipe_type_id);
  end if;
  return new;
end;
$$;

revoke all on function public.pipe_order_lines_kostpris() from public, anon, authenticated;

drop trigger if exists trg_pipe_order_lines_kostpris on public.pipe_order_lines;
create trigger trg_pipe_order_lines_kostpris
  before insert or update of pipe_type_id on public.pipe_order_lines
  for each row execute function public.pipe_order_lines_kostpris();

-- Dei som finst: beste anslag er kostprisen i dag.
update public.pipe_order_lines l
   set unit_cost = t.cost_price
  from public.pipe_types t
 where l.pipe_type_id = t.id and l.unit_cost is null and t.cost_price is not null;


-- ── 2. Byggjeplassen ser uttaka til jobben sin ──

create or replace function public.pipe_prosjekt_uttak(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.hm_er_prosjektmedlem(p_project_id) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id,
             'order_number', o.order_number,
             'created_at', o.created_at,
             'tatt_ut_av', o.customer_name,
             'linjer', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'name', l.name, 'dimension', l.dimension, 'quantity', l.quantity, 'unit', l.unit
                      ) order by l.sort_order)
                 from public.pipe_order_lines l where l.order_id = o.id
             ), '[]'::jsonb)
           ) order by o.created_at desc)
      from public.pipe_orders o
     where o.project_id = p_project_id and o.kind = 'uttak'
  ), '[]'::jsonb) end
$$;

revoke all on function public.pipe_prosjekt_uttak(uuid) from public, anon;
grant execute on function public.pipe_prosjekt_uttak(uuid) to authenticated;
