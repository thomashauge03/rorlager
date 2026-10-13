-- Kontoret rettar mengda på ei linje: 60 m der det skulle stått 6 m.
--
-- Den vanlegaste feilen på lageret, og den einaste retten var å slette heile
-- uttaket og registrere det på nytt. Same mønster som pipe_bytt_vare
-- (20261014110000): lageret får differansen, med grunnen «retting» i
-- lagerloggen, linja og summen blir rekna på nytt, og eit fakturert uttak blir
-- ikkje rørt.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

create or replace function public.pipe_endre_mengde(p_line_id uuid, p_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.pipe_order_lines;
  v_order public.pipe_orders;
  v_qty numeric := round(p_quantity, 2);
  v_diff numeric;
  v_balance numeric;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'Skriv en mengde over null. Skal linjen bort, slett uttaket.';
  end if;
  if v_qty > 100000 then
    raise exception 'Mengden er urimelig stor';
  end if;

  select * into v_line from public.pipe_order_lines where id = p_line_id;
  if not found then
    raise exception 'Fant ikke linjen';
  end if;

  select * into v_order from public.pipe_orders where id = v_line.order_id for update;
  if v_order.invoice_id is not null then
    raise exception 'Uttaket er fakturert. Slett fakturagrunnlaget først.';
  end if;

  v_diff := v_qty - v_line.quantity;
  if v_diff = 0 then
    return to_jsonb(v_line);
  end if;

  -- Lageret følgjer berre når ordren har trekt det, og berre for ei vare frå
  -- lageret – ei annet-linje har inga beholdning.
  if v_order.stock_drawn_at is not null and v_line.pipe_type_id is not null and not v_line.is_annet then
    update public.pipe_types set stock = stock - v_diff
     where id = v_line.pipe_type_id
    returning stock into v_balance;
    if found then
      insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note)
      values (v_line.pipe_type_id, v_line.name, -v_diff, v_balance, 'retting', v_order.id,
              '#' || v_order.order_number || ': mengde ' || trim(to_char(v_line.quantity, 'FM999999990.##'))
              || ' → ' || trim(to_char(v_qty, 'FM999999990.##')) || ' ' || v_line.unit);
    end if;
  end if;

  update public.pipe_order_lines
     set quantity = v_qty,
         line_total = case when unit_price is null then null else round(unit_price * v_qty, 2) end
   where id = p_line_id
  returning * into v_line;

  update public.pipe_suggestions set quantity = v_qty where order_line_id = p_line_id;

  perform public.pipe_rekn_total(v_order.id);

  return to_jsonb(v_line);
end;
$$;

revoke all on function public.pipe_endre_mengde(uuid, numeric) from public, anon;
grant execute on function public.pipe_endre_mengde(uuid, numeric) to authenticated;
