-- Strekkoden frå produsenten (EAN/GTIN) på vara, så skannaren kjenner att
-- emballasjen og ikkje berre QR-koden på hylla.
--
-- Oppslaget går gjennom ein funksjon, ikkje gjennom pipe_catalog: visninga
-- listar kolonnane sine, og ei ny kolonne der ville velta den gamle
-- migrasjonen neste gong setup blir limt inn (create or replace view kan ikkje
-- miste kolonner). Funksjonen gir berre QR-koden til vara, og kundesida hentar
-- resten som før.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

alter table public.pipe_types add column if not exists ean text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipe_types_ean_check') then
    alter table public.pipe_types add constraint pipe_types_ean_check check (ean is null or ean ~ '^[0-9]{8,14}$');
  end if;
end $$;

create unique index if not exists idx_pipe_types_ean on public.pipe_types (ean) where ean is not null;

comment on column public.pipe_types.ean is 'Strekkoden frå produsenten (EAN/GTIN, 8–14 siffer). Skannaren slår opp på han.';

create or replace function public.pipe_finn_ean(p_ean text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select qr_slug from public.pipe_types
   where ean = btrim(p_ean) and active
   limit 1
$$;

revoke all on function public.pipe_finn_ean(text) from public;
grant execute on function public.pipe_finn_ean(text) to anon, authenticated;
