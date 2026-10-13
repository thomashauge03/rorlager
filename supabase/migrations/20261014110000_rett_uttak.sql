-- Kontoret rettar eit uttak: anna prosjekt, nytt namn på ei annet-linje, eller
-- ei anna vare.
--
-- Eit uttak blir registrert på lageret av den som står der, ofte med hanskar på
-- og ein telefon i handa. Feil prosjekt, «180 rør noe 180mm» og feil rør i
-- kurva er det vanlege, og fram til no var den einaste retten å slette heile
-- uttaket og registrere det på nytt.
--
-- Tre funksjonar, alle berre for kontoret, og alle nektar eit uttak som er
-- fakturert: fakturagrunnlaget er sendt, og det skal stemme med ordren.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.


-- Summen på ordren, rekna frå linjene. Same reknestykke som pipe_price_line.
create or replace function public.pipe_rekn_total(p_order_id uuid)
returns void
language sql
volatile
set search_path = public
as $$
  update public.pipe_orders
     set total = coalesce((
       select sum(line_total) from public.pipe_order_lines where order_id = p_order_id and line_total is not null
     ), 0)
   where id = p_order_id
$$;

revoke all on function public.pipe_rekn_total(uuid) from public, anon, authenticated;


-- ── 1. Anna prosjekt ──
--
-- Med p_project_id blir teksten skriven frå prosjektet, same som i kassen –
-- fakturagrunnlaget samlar på teksten. Utan blir p_project brukt som fritekst.
-- Eit avslutta prosjekt er lov her: uttaket kan vere gamalt, og kontoret veit
-- kva det gjer.

create or replace function public.pipe_bytt_prosjekt(
  p_order_id uuid,
  p_project_id uuid default null,
  p_project text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_prosjekt public.projects;
  v_tekst text := nullif(btrim(coalesce(p_project, '')), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if not found then
    raise exception 'Fant ikke uttaket';
  end if;
  if v_order.invoice_id is not null then
    raise exception 'Uttaket er fakturert. Slett fakturagrunnlaget først.';
  end if;

  if p_project_id is not null then
    select * into v_prosjekt from public.projects where id = p_project_id;
    if not found then
      raise exception 'Fant ikke prosjektet';
    end if;
    v_tekst := public.pipe_prosjekttekst(v_prosjekt.project_number, v_prosjekt.name);
  elsif v_tekst is null then
    raise exception 'Velg et prosjekt eller skriv hvor varene skal';
  elsif length(v_tekst) > 200 then
    raise exception 'Prosjektteksten er for lang (høyst 200 tegn)';
  end if;

  update public.pipe_orders
     set project = v_tekst,
         project_id = p_project_id
   where id = p_order_id
  returning * into v_order;

  return jsonb_build_object('project', v_order.project, 'project_id', v_order.project_id);
end;
$$;

revoke all on function public.pipe_bytt_prosjekt(uuid, uuid, text) from public, anon;
grant execute on function public.pipe_bytt_prosjekt(uuid, uuid, text) to authenticated;


-- ── 2. Nytt namn på ei annet-linje ──
--
-- Forslaget følgjer med, så «Opprett vare» under Forslag blir fylt ut med det
-- kontoret faktisk meinte og ikkje med det som blei tasta på lageret.

create or replace function public.pipe_endre_annet(
  p_line_id uuid,
  p_name text,
  p_dimension text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.pipe_order_lines;
  v_order public.pipe_orders;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_dim text := nullif(btrim(coalesce(p_dimension, '')), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Skriv hva varen er';
  end if;
  if length(v_name) > 120 then
    raise exception 'Navnet på varen er for langt (høyst 120 tegn)';
  end if;
  if length(coalesce(v_dim, '')) > 60 then
    raise exception 'Dimensjonen er for lang (høyst 60 tegn)';
  end if;

  select * into v_line from public.pipe_order_lines where id = p_line_id;
  if not found then
    raise exception 'Fant ikke linjen';
  end if;
  if not v_line.is_annet then
    raise exception 'Bare «annet»-linjer kan få nytt navn. Bruk «Bytt vare» på en vare fra katalogen.';
  end if;

  select * into v_order from public.pipe_orders where id = v_line.order_id for update;
  if v_order.invoice_id is not null then
    raise exception 'Uttaket er fakturert. Slett fakturagrunnlaget først.';
  end if;

  update public.pipe_order_lines
     set name = v_name, dimension = v_dim
   where id = p_line_id
  returning * into v_line;

  update public.pipe_suggestions
     set name = v_name, dimension = v_dim
   where order_line_id = p_line_id;

  return to_jsonb(v_line);
end;
$$;

revoke all on function public.pipe_endre_annet(uuid, text, text) from public, anon;
grant execute on function public.pipe_endre_annet(uuid, text, text) to authenticated;


-- ── 3. Anna vare ──
--
-- Linja får vara sitt namn, varenummer, eining og pris. Mengda står.
--
-- Lageret følgjer berre når ordren faktisk har trekt det (stock_drawn_at):
-- eit uttak alltid, ei bestilling først når ho er godkjend. Då går den gamle
-- vara tilbake på lageret og den nye blir trekt, og begge står i lagerloggen
-- med grunnen «retting». Ei annet-linje hadde inga vare, så der blir berre den
-- nye trekt.
--
-- Var linja ei annet-linje, er forslaget løyst: vara finst, og ho er knytt til
-- forslaget.

create or replace function public.pipe_bytt_vare(p_line_id uuid, p_pipe_type_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.pipe_order_lines;
  v_order public.pipe_orders;
  v_ny public.pipe_types;
  v_gamal_namn text;
  v_balance numeric;
  v_merknad text;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select * into v_line from public.pipe_order_lines where id = p_line_id;
  if not found then
    raise exception 'Fant ikke linjen';
  end if;

  select * into v_order from public.pipe_orders where id = v_line.order_id for update;
  if v_order.invoice_id is not null then
    raise exception 'Uttaket er fakturert. Slett fakturagrunnlaget først.';
  end if;

  select * into v_ny from public.pipe_types where id = p_pipe_type_id;
  if not found then
    raise exception 'Fant ikke varen';
  end if;
  if v_line.pipe_type_id is not distinct from v_ny.id and not v_line.is_annet then
    raise exception 'Linjen har allerede denne varen';
  end if;

  v_gamal_namn := btrim(v_line.name || coalesce(' ' || v_line.dimension, ''));
  v_merknad := '#' || v_order.order_number || ': ' || v_gamal_namn || ' byttet til '
               || btrim(v_ny.name || coalesce(' ' || v_ny.dimension, ''));

  if v_order.stock_drawn_at is not null then
    -- Den gamle tilbake, om det var ei vare frå lageret
    if v_line.pipe_type_id is not null and not v_line.is_annet then
      update public.pipe_types set stock = stock + v_line.quantity
       where id = v_line.pipe_type_id
      returning stock into v_balance;
      if found then
        insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note)
        values (v_line.pipe_type_id, v_line.name, v_line.quantity, v_balance, 'retting', v_order.id, v_merknad);
      end if;
    end if;

    update public.pipe_types set stock = stock - v_line.quantity
     where id = v_ny.id
    returning stock into v_balance;
    insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note)
    values (v_ny.id, v_ny.name, -v_line.quantity, v_balance, 'retting', v_order.id, v_merknad);
  end if;

  update public.pipe_order_lines
     set pipe_type_id = v_ny.id,
         name = v_ny.name,
         dimension = v_ny.dimension,
         sku = v_ny.sku,
         unit = v_ny.unit,
         unit_price = v_ny.price,
         line_total = case when v_ny.price is null then null else round(v_ny.price * quantity, 2) end,
         is_annet = false
   where id = p_line_id
  returning * into v_line;

  update public.pipe_suggestions
     set status = 'opprettet',
         pipe_type_id = v_ny.id,
         handled_at = now(),
         handled_by = auth.uid()
   where order_line_id = p_line_id
     and status = 'ny';

  perform public.pipe_rekn_total(v_order.id);

  return to_jsonb(v_line);
end;
$$;

revoke all on function public.pipe_bytt_vare(uuid, uuid) from public, anon;
grant execute on function public.pipe_bytt_vare(uuid, uuid) to authenticated;
