-- Eit avvik skal kunne lukkast.
--
-- Avvika kom fram: plassen registrerer «skadet» eller «feil vare», og kontoret
-- ser det under Å bestille → Avvik. Men lista hadde ingen botn. Ingen dato,
-- ingen filter, ingen måte å seie «denne er ordna». Ho voks berre.
--
-- Etter ein sesong er ho historikk med reklamasjonar frå i fjor øvst i
-- synsfeltet, og då sluttar ho å bli lesen. Ei liste ingen les er funksjonelt
-- det same som eit avvik som aldri kom fram – berre med eit skjermbilde som ser
-- ut som om det verkar.

alter table public.project_receipt_lines
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text;

-- Uhandsama avvik først. Indeksen er delvis: dei handsama er dei mange, og det
-- er dei uhandsama spørjinga alltid leitar etter.
create index if not exists idx_receipt_lines_uhandsama
  on public.project_receipt_lines (receipt_id)
  where deviation <> 'ingen' and resolved_at is null;

/*
 * Kontoret krysser av.
 *
 * Går gjennom ein funksjon og ikkje rett på tabellen, av same grunn som resten
 * av skrivevegane: policyen på project_receipt_lines slepp plassen til for at
 * han skal få skrive mottaket sitt, og han skal ikkje kunne lukke sitt eige
 * avvik. Det er kontoret som følgjer det opp mot leverandøren.
 */
create or replace function public.project_resolve_deviation(
  p_line_id uuid,
  p_handtert boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avvik text;
begin
  if not public.hm_er_kontor() then
    raise exception 'Bare kontoret kan håndtere avvik';
  end if;

  select deviation into v_avvik from public.project_receipt_lines where id = p_line_id;
  if not found then
    raise exception 'Fant ikke avviket';
  end if;
  if v_avvik = 'ingen' then
    raise exception 'Denne linjen har ikke noe avvik';
  end if;

  update public.project_receipt_lines
     set resolved_at = case when p_handtert then now() else null end,
         resolved_by = case when p_handtert then nullif(auth.jwt() ->> 'email', '') else null end
   where id = p_line_id;
end;
$$;

revoke all on function public.project_resolve_deviation(uuid, boolean) from public, anon;
grant execute on function public.project_resolve_deviation(uuid, boolean) to authenticated;
