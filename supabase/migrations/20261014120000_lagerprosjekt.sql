-- Kvar alt som blir teke ut, kjem frå: lagerprosjektet.
--
-- Rør som går ut av lageret – til ein kunde, til ein tilsett på ein jobb, eller
-- som ei bestilling – blir ført ut av prosjektet «Lagervarer Rør» (2014131) i
-- rekneskapen. Kontoret treng å sjå det på kvar ordre. Kunden skal ikkje: det
-- er eit internt prosjektnummer, og det står ingen stad kunden ser.
--
-- Prosjektet er ei innstilling, ikkje eit tal i koden: byter firmaet
-- lagerprosjekt, blir det endra éin stad. Ordren tek med seg det som galdt då
-- han blei send inn, slik at gamle uttak ikkje flyttar seg når innstillinga
-- blir endra.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

-- ── 1. Innstillinga ──

alter table public.pipe_settings add column if not exists stock_project_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipe_settings_stock_project_id_fkey') then
    alter table public.pipe_settings
      add constraint pipe_settings_stock_project_id_fkey
      foreign key (stock_project_id) references public.projects(id) on delete set null;
  end if;
end $$;

comment on column public.pipe_settings.stock_project_id is
  'Prosjektet alt som blir teke ut av lageret, kjem frå (Lagervarer Rør, 2014131). Berre for kontoret – ikkje med i pipe_public_settings.';

-- Første gong: prosjektet med nummer 2014131, om det er henta frå SmartDok.
-- Er innstillinga alt sett, blir ho ståande.
update public.pipe_settings
   set stock_project_id = (select id from public.projects where project_number = 2014131 limit 1)
 where stock_project_id is null;


-- ── 2. Ordren ──

alter table public.pipe_orders add column if not exists stock_project_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipe_orders_stock_project_id_fkey') then
    alter table public.pipe_orders
      add constraint pipe_orders_stock_project_id_fkey
      foreign key (stock_project_id) references public.projects(id) on delete set null;
  end if;
end $$;

comment on column public.pipe_orders.stock_project_id is
  'Lagerprosjektet varene kom frå, slik innstillinga var då ordren blei send inn. Berre for kontoret.';

/*
 * Set av ein trigger, ikkje av innsendingsfunksjonane.
 *
 * Det er tre av dei (uttak, bestilling, og den gamle signaturen ein eldre
 * klient kan treffe), og kvar av dei ville måtte hugse det. Ein trigger på
 * tabellen treffer alle, òg ein ny funksjon ingen har skrive enno.
 */
create or replace function public.pipe_orders_lagerprosjekt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock_project_id is null then
    new.stock_project_id := (select stock_project_id from public.pipe_settings where id = 1);
  end if;
  return new;
end;
$$;

revoke all on function public.pipe_orders_lagerprosjekt() from public, anon, authenticated;

drop trigger if exists trg_pipe_orders_lagerprosjekt on public.pipe_orders;
create trigger trg_pipe_orders_lagerprosjekt
  before insert on public.pipe_orders
  for each row execute function public.pipe_orders_lagerprosjekt();

-- Dei som finst: same lager, så same prosjekt.
update public.pipe_orders
   set stock_project_id = (select stock_project_id from public.pipe_settings where id = 1)
 where stock_project_id is null;
