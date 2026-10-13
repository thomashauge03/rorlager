-- Retur til lager, knytt til uttaket.
--
-- Overskotsrør kjem tilbake frå plassen. Før fanst berre manuell justering av
-- beholdninga, og kunden betalte for røra likevel.
--
-- Korleis returen blir ført, avheng av om uttaket er fakturert:
--
--   Ikkje fakturert  Linja blir mindre (eller borte), røra går tilbake på
--                    lageret, og summen blir rekna på nytt.
--   Fakturert        Grunnlaget er sendt og skal ikkje endre seg. Det blir
--                    laga ein returordre med negativ sum på same kunde eller
--                    jobb, og han kjem med som kreditering på neste
--                    fakturagrunnlag. Røra går tilbake på lageret med ein gong.
--
-- Returordren er kind = 'uttak' med retur_av sett, ikkje ein ny kind: regelen
-- pipe_orders_kind_check blir lagd på nytt kvar gong setup blir limt inn, med
-- berre 'uttak' og 'bestilling', og ville då velta på den første returen.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

alter table public.pipe_orders add column if not exists retur_av uuid;
alter table public.pipe_order_lines add column if not exists retur_av_linje uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipe_orders_retur_av_fkey') then
    alter table public.pipe_orders
      add constraint pipe_orders_retur_av_fkey foreign key (retur_av) references public.pipe_orders(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pipe_order_lines_retur_av_linje_fkey') then
    alter table public.pipe_order_lines
      add constraint pipe_order_lines_retur_av_linje_fkey foreign key (retur_av_linje) references public.pipe_order_lines(id) on delete set null;
  end if;
end $$;

create index if not exists idx_pipe_orders_retur_av on public.pipe_orders (retur_av) where retur_av is not null;
create index if not exists idx_pipe_order_lines_retur_av_linje on public.pipe_order_lines (retur_av_linje) where retur_av_linje is not null;

comment on column public.pipe_orders.retur_av is 'Uttaket denne returen krediterer. Null for alt anna enn returordrar.';
comment on column public.pipe_order_lines.retur_av_linje is 'Linja denne returlinja krediterer.';


-- ── Ei returlinje blir ikkje retta ──
--
-- pipe_endre_mengde og pipe_bytt_vare reknar lageret som om linja er eit
-- uttak. På ei returlinje ville dei trekt lageret feil veg. Ein trigger stoppar
-- det for alle, også funksjonar som kjem seinare. Pris kan framleis setjast.

create or replace function public.pipe_order_lines_retur_last()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.pipe_orders where id = new.order_id and retur_av is not null) then
    raise exception 'En returlinje kan ikke endres. Slett returen og registrer den på nytt.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pipe_order_lines_retur_last on public.pipe_order_lines;
create trigger trg_pipe_order_lines_retur_last
  before update of quantity, pipe_type_id on public.pipe_order_lines
  for each row execute function public.pipe_order_lines_retur_last();


-- ── Returen ──

create or replace function public.pipe_retur(p_line_id uuid, p_quantity numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.pipe_order_lines;
  v_order public.pipe_orders;
  v_retur public.pipe_orders;
  v_qty numeric := round(p_quantity, 2);
  v_kreditert numeric;
  v_igjen numeric;
  v_balance numeric;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fraLager boolean;
  v_merknad text;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Merknaden er for lang (høyst 300 tegn)';
  end if;

  select * into v_line from public.pipe_order_lines where id = p_line_id;
  if not found then
    raise exception 'Fant ikke linjen';
  end if;
  select * into v_order from public.pipe_orders where id = v_line.order_id for update;

  if v_order.retur_av is not null then
    raise exception 'Dette er en retur. Den kan ikke returneres.';
  end if;
  if v_order.stock_drawn_at is null then
    raise exception 'Lageret er ikke trukket for denne bestillingen. Endre mengden i stedet.';
  end if;

  select coalesce(sum(quantity), 0) into v_kreditert
    from public.pipe_order_lines where retur_av_linje = v_line.id;
  v_igjen := v_line.quantity - v_kreditert;

  if v_qty is null or v_qty <= 0 then
    raise exception 'Skriv hvor mye som kommer tilbake';
  end if;
  if v_qty > v_igjen then
    raise exception 'Det kan returneres høyst % % av denne linjen', trim(to_char(v_igjen, 'FM999999990.##')), v_line.unit;
  end if;

  v_fraLager := v_line.pipe_type_id is not null and not v_line.is_annet;
  v_merknad := '#' || v_order.order_number || ': retur ' || trim(to_char(v_qty, 'FM999999990.##')) || ' ' || v_line.unit
               || coalesce(' – ' || v_note, '');

  -- Røra tilbake på lageret, uansett korleis returen blir ført
  if v_fraLager then
    update public.pipe_types set stock = stock + v_qty where id = v_line.pipe_type_id returning stock into v_balance;
    if found then
      insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note)
      values (v_line.pipe_type_id, v_line.name, v_qty, v_balance, 'retur', v_order.id, v_merknad);
    end if;
  end if;

  -- Ikkje fakturert, og ingen kreditering frå før: rett på linja
  if v_order.invoice_id is null and v_kreditert = 0 then
    if v_qty = v_line.quantity then
      delete from public.pipe_order_lines where id = v_line.id;
    else
      update public.pipe_order_lines
         set quantity = quantity - v_qty,
             line_total = case when unit_price is null then null else round(unit_price * (quantity - v_qty), 2) end
       where id = v_line.id;
    end if;
    perform public.pipe_rekn_total(v_order.id);
    if v_note is not null then
      update public.pipe_orders
         set admin_note = btrim(coalesce(admin_note || E'\n', '') || 'Retur: ' || v_merknad)
       where id = v_order.id;
    end if;
    return jsonb_build_object('fort', 'redusert', 'order_id', v_order.id);
  end if;

  -- Fakturert: ein returordre på same kunde. Er det alt ein open retur for
  -- dette uttaket, kjem linja på han, så kunden får éi kreditering og ikkje fem.
  select * into v_retur from public.pipe_orders
   where retur_av = v_order.id and invoice_id is null
   order by created_at desc limit 1
   for update;

  if not found then
    insert into public.pipe_orders (
      kind, status, stock_drawn_at, customer_type, customer_name, customer_phone, customer_email,
      company, org_number, billing_address, pickup_date, pickup_now, project, project_id, created_by,
      comment, retur_av
    ) values (
      v_order.kind,
      case when v_order.kind = 'bestilling' then 'levert' else 'ny' end,
      now(), v_order.customer_type, v_order.customer_name, v_order.customer_phone, v_order.customer_email,
      v_order.company, v_order.org_number, v_order.billing_address, v_order.pickup_date, v_order.pickup_now,
      v_order.project, v_order.project_id, v_order.created_by,
      'Retur av #' || v_order.order_number, v_order.id
    )
    returning * into v_retur;
  end if;

  insert into public.pipe_order_lines (
    order_id, pipe_type_id, name, dimension, sku, unit, quantity, unit_price, line_total, sort_order, is_annet, retur_av_linje
  ) values (
    v_retur.id, v_line.pipe_type_id, v_line.name, v_line.dimension, v_line.sku, v_line.unit, v_qty,
    case when v_line.unit_price is null then null else -v_line.unit_price end,
    case when v_line.unit_price is null then null else -round(v_line.unit_price * v_qty, 2) end,
    (select coalesce(max(sort_order), 0) + 1 from public.pipe_order_lines where order_id = v_retur.id),
    v_line.is_annet, v_line.id
  );

  perform public.pipe_rekn_total(v_retur.id);
  if v_note is not null then
    update public.pipe_orders
       set admin_note = btrim(coalesce(admin_note || E'\n', '') || v_merknad)
     where id = v_retur.id;
  end if;

  return jsonb_build_object('fort', 'kreditert', 'order_id', v_retur.id, 'order_number', v_retur.order_number);
end;
$$;

revoke all on function public.pipe_retur(uuid, numeric, text) from public, anon;
grant execute on function public.pipe_retur(uuid, numeric, text) to authenticated;


-- ── Sletting av ein retur tek røra ut att ──
--
-- Som i 20261014130000_sikring.sql, pluss éin ting: ein returordre la røra
-- TILBAKE på lageret, så å slette han må trekkje dei ut att – ikkje leggje dei
-- til ein gong til.

create or replace function public.pipe_delete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_balance numeric;
  v_number bigint;
  v_drawn timestamptz;
  v_invoice uuid;
  v_retur uuid;
  v_forteikn numeric;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select order_number, stock_drawn_at, invoice_id, retur_av into v_number, v_drawn, v_invoice, v_retur
    from public.pipe_orders where id = p_order_id
     for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;
  if v_invoice is not null then
    raise exception 'Bestillingen er fakturert. Slett fakturagrunnlaget først.';
  end if;

  -- Eit uttak blir lagt tilbake (+), ein retur blir teken ut att (−)
  v_forteikn := case when v_retur is null then 1 else -1 end;

  if v_drawn is not null then
    for v_line in
      select pipe_type_id, name, quantity, is_annet from public.pipe_order_lines where order_id = p_order_id
    loop
      if v_line.pipe_type_id is not null and not v_line.is_annet then
        update public.pipe_types set stock = stock + v_forteikn * v_line.quantity
          where id = v_line.pipe_type_id
          returning stock into v_balance;

        insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
        values (v_line.pipe_type_id, v_line.name, v_forteikn * v_line.quantity, v_balance, 'sletting',
                case when v_retur is null then 'Slettet bestilling #' else 'Slettet retur #' end || v_number, auth.uid());
      end if;
    end loop;
  end if;

  delete from public.pipe_orders where id = p_order_id;
end;
$$;

revoke all on function public.pipe_delete_order(uuid) from public, anon;
grant execute on function public.pipe_delete_order(uuid) to authenticated;
