-- Uttak på brukaren, og e-post frå kundane.
--
-- Ein kunde utan innlogging må skrive noko i e-postfeltet. Har han ingen
-- e-post, er «ingen» godt nok – feltet har ingen formatsjekk med vilje.
--
-- Ein tilsett som er logga inn, blir registrert på brukaren sin. Namn og e-post
-- kjem frå innlogginga, ikkje frå skjemaet, så eit uttak kan ikkje førast på
-- nokon andre. Han skriv berre kva jobb eller prosjekt varene skal til, og
-- fakturagrunnlaget samlar uttaka under jobben.
--
-- Lagerendringar har alltid lagra brukaren (created_by), men berre som ein
-- uuid ingen i panelet kan lese. No står namnet der òg.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

-- Kven tok ut. Null for kundar utan innlogging.
alter table public.pipe_orders add column if not exists created_by uuid;

comment on column public.pipe_orders.created_by is
  'Den innlogga brukaren som tok ut. Null for kundar utan innlogging. Blir sett av pipe_submit_order, aldri av klienten.';

/*
 * Namnet på den innlogga: frå system_users, elles e-posten. Null utan innlogging.
 *
 * SECURITY DEFINER fordi system_users berre kan lesast av ein superadmin – og
 * ein lagermann skal likevel kunne sjå sitt eige namn.
 */
create or replace function public.hm_mitt_namn()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    else coalesce(
      (select nullif(btrim(s.full_name), '')
         from public.system_users s
        where lower(s.email) = lower(auth.jwt() ->> 'email')
        limit 1),
      nullif(auth.jwt() ->> 'email', '')
    )
  end
$$;

revoke all on function public.hm_mitt_namn() from public, anon;
grant execute on function public.hm_mitt_namn() to authenticated;

/* Den innlogga, slik kassen viser han: «Registreres på deg: Leif Lager». */
create or replace function public.hm_meg()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    else jsonb_build_object('epost', auth.jwt() ->> 'email', 'navn', public.hm_mitt_namn())
  end
$$;

revoke all on function public.hm_meg() from public, anon;
grant execute on function public.hm_meg() to authenticated;

/*
 * Namnet i lagerloggen.
 *
 * Som standardverdi, så kvar funksjon som skriv i loggen får det med utan å
 * måtte rettast: justering, varemottak, telling, uttak og sletting. Verdien
 * blir rekna ut i funksjonen som skriv, og han har rett til å kalle
 * hm_mitt_namn sjølv om den som ringde, ikkje har det.
 */
alter table public.pipe_stock_log add column if not exists created_by_name text;
alter table public.pipe_stock_log alter column created_by_name set default public.hm_mitt_namn();

-- Uttaket og godkjenninga av ei bestilling skreiv loggen utan created_by. Med
-- standardverdi får dei brukaren òg; funksjonane som sender han sjølv, gjer
-- som før.
alter table public.pipe_stock_log alter column created_by set default auth.uid();

-- Dei gamle radene: brukaren står der alt som uuid. auth.users finst i
-- Supabase, men ikkje i testbasen, så oppslaget står i ein vakt.
do $$
begin
  if to_regclass('auth.users') is not null then
    update public.pipe_stock_log l
       set created_by_name = coalesce(nullif(btrim(s.full_name), ''), u.email)
      from auth.users u
      left join public.system_users s on lower(s.email) = lower(u.email)
     where l.created_by = u.id
       and l.created_by_name is null;
  end if;
end $$;

/*
 * Uttaket, med to nye reglar.
 *
 * Same signatur som før, så grensesnittet treng ikkje vite om basen er
 * oppdatert. Rekkjefølgja på sjekkane er med vilje: namn, så e-post eller jobb,
 * så handlekurva. Då kan check:db prøve e-postkravet med ei tom kurv, utan å
 * lage eit uttak i den levande basen.
 */
create or replace function public.pipe_submit_order(
  p_customer_name text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_company text default null,
  p_project text default null,
  p_comment text default null,
  p_signature text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_line jsonb;
  v_type public.pipe_types;
  v_qty numeric;
  v_total numeric := 0;
  v_i integer := 0;
  v_name text;
  v_email text;
  v_innlogga boolean := auth.uid() is not null;
  v_lines_out jsonb := '[]'::jsonb;
  v_balance numeric;
begin
  if v_innlogga then
    -- Ein tilsett: registrert på brukaren, uansett kva skjemaet sende.
    v_name := public.hm_mitt_namn();
    v_email := nullif(auth.jwt() ->> 'email', '');
  else
    v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
    v_email := nullif(btrim(coalesce(p_customer_email, '')), '');
  end if;

  if v_name is null then
    raise exception 'Navn må fylles ut';
  end if;

  if v_innlogga then
    if nullif(btrim(coalesce(p_project, '')), '') is null then
      raise exception 'Skriv hvilken jobb eller hvilket prosjekt varene skal til';
    end if;
  elsif v_email is null then
    raise exception 'E-post må fylles ut. Har du ikke e-post, skriv «ingen».';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Handlekurven er tom';
  end if;

  -- Tak på tal linjer: skjemaet kan ikkje lage så mange, så dette er ei sperre
  -- mot at nokon sender inn tusenvis av linjer rett mot funksjonen.
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'For mange varelinjer';
  end if;

  insert into public.pipe_orders (
    customer_name, customer_phone, customer_email, company, project, comment, signature, created_by
  ) values (
    v_name,
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    v_email,
    nullif(btrim(coalesce(p_company, '')), ''),
    nullif(btrim(coalesce(p_project, '')), ''),
    nullif(btrim(coalesce(p_comment, '')), ''),
    nullif(p_signature, ''),
    auth.uid()
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := round((v_line ->> 'quantity')::numeric, 2);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Ugyldig mengde på en av linjene';
    end if;
    if v_qty > 100000 then
      raise exception 'Mengden er urimelig stor';
    end if;

    select * into v_type from public.pipe_types where id = (v_line ->> 'pipe_type_id')::uuid;
    if not found then
      raise exception 'Ukjent rørtype i handlekurven';
    end if;
    if not v_type.active then
      raise exception 'Varen % er ikke tilgjengelig', v_type.name;
    end if;

    v_i := v_i + 1;

    insert into public.pipe_order_lines (
      order_id, pipe_type_id, name, dimension, sku, unit, quantity, unit_price, line_total, sort_order
    ) values (
      v_order.id, v_type.id, v_type.name, v_type.dimension, v_type.sku, v_type.unit,
      v_qty, v_type.price,
      case when v_type.price is null then null else round(v_type.price * v_qty, 2) end,
      v_i
    );

    if v_type.price is not null then
      v_total := v_total + round(v_type.price * v_qty, 2);
    end if;

    -- Uttaket blir trekt frå med ein gong. Beholdninga får gå i minus:
    -- det er reell informasjon om at nokon har teke meir enn lageret viste.
    update public.pipe_types
      set stock = stock - v_qty
      where id = v_type.id
      returning stock into v_balance;

    insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note)
    values (v_type.id, v_type.name, -v_qty, v_balance, 'bestilling', v_order.id,
            'Bestilling #' || v_order.order_number);

    v_lines_out := v_lines_out || jsonb_build_object(
      'name', v_type.name,
      'dimension', v_type.dimension,
      'sku', v_type.sku,
      'unit', v_type.unit,
      'quantity', v_qty,
      'unit_price', v_type.price,
      'line_total', case when v_type.price is null then null else round(v_type.price * v_qty, 2) end
    );
  end loop;

  update public.pipe_orders set total = v_total where id = v_order.id returning * into v_order;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'customer_name', v_order.customer_name,
    'company', v_order.company,
    'project', v_order.project,
    'comment', v_order.comment,
    'total', v_order.total,
    'lines', v_lines_out
  );
end;
$$;

revoke all on function public.pipe_submit_order(text, jsonb, text, text, text, text, text, text) from public;
grant execute on function public.pipe_submit_order(text, jsonb, text, text, text, text, text, text) to anon, authenticated;
