-- Bestilling for henting: innsending, oppslag, godkjenning og avvisning.
--
-- Kunden er anonym, så innsendinga går gjennom ein funksjon og ikkje eit
-- INSERT – same grunn som pipe_submit_order: prisane skal hentast i basen, og
-- ingenting klienten meiner om pris, namn eller hentedag skal takast for god
-- fisk. Kontoret godkjenner og avviser gjennom funksjonar fordi begge flyttar
-- rør, og det må skje i same transaksjon som statusen.


-- ── Organisasjonsnummer ──

/*
 * Modulus 11 med vektene 3 2 7 6 5 4 3 2. Norske organisasjonsnummer har ni
 * siffer og startar på 8 eller 9. Rest 0 gir kontrollsiffer 0; kontrollsiffer
 * 10 finst ikkje, så eit nummer som ville trengt det er ugyldig.
 *
 * Same regel som supabase/functions/_shared/orgnr.ts. Skjemaet seier frå med
 * ein gong, men det er denne som avgjer.
 */
create or replace function public.hm_orgnr_gyldig(p_orgnr text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := regexp_replace(coalesce(p_orgnr, ''), '\s', '', 'g');
  v_vekter int[] := array[3, 2, 7, 6, 5, 4, 3, 2];
  v_sum int := 0;
  v_rest int;
  v_kontroll int;
begin
  if v !~ '^[89][0-9]{8}$' then
    return false;
  end if;
  for i in 1..8 loop
    v_sum := v_sum + substr(v, i, 1)::int * v_vekter[i];
  end loop;
  v_rest := v_sum % 11;
  v_kontroll := case when v_rest = 0 then 0 else 11 - v_rest end;
  return v_kontroll <> 10 and v_kontroll = substr(v, 9, 1)::int;
end;
$$;

-- Treng inga kjørerett: han blir berre kalla inne frå pipe_submit_pickup_order,
-- som køyrer med eigaren sine rettar.
revoke all on function public.hm_orgnr_gyldig(text) from public, anon, authenticated;


-- ── Innsending ──

create or replace function public.pipe_submit_pickup_order(
  p_customer_type text,
  p_customer_name text,
  p_customer_email text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_company text default null,
  p_org_number text default null,
  p_billing_address text default null,
  p_pickup_now boolean default false,
  p_pickup_date date default null,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.pipe_settings;
  v_type text := lower(btrim(coalesce(p_customer_type, '')));
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_customer_email, '')), ''));
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_org text := nullif(regexp_replace(coalesce(p_org_number, ''), '\s', '', 'g'), '');
  v_address text := nullif(btrim(coalesce(p_billing_address, '')), '');
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_now boolean := coalesce(p_pickup_now, false);
  -- Norsk dato, ikkje UTC: mellom midnatt og klokka to om natta er «i dag» i
  -- UTC framleis i går, og då ville ein kunde som bestilte klokka ett fått
  -- beskjed om at dagen hans er tilbake i tid.
  v_today date := (now() at time zone 'Europe/Oslo')::date;
  v_pickup date;
  v_order public.pipe_orders;
  v_line jsonb;
  v_pipe public.pipe_types;
  v_qty numeric;
  v_total numeric := 0;
  v_i integer := 0;
begin
  select * into v_settings from public.pipe_settings where id = 1;
  if not coalesce(v_settings.accept_orders, false) then
    raise exception 'Vi tar ikke imot bestillinger på nett akkurat nå';
  end if;

  if v_type not in ('privat', 'bedrift') then
    raise exception 'Velg om du bestiller som privatperson eller bedrift';
  end if;

  if v_name is null then
    raise exception 'Navn må fylles ut';
  end if;
  if length(v_name) > 100 then
    raise exception 'Navnet er for langt (høyst 100 tegn)';
  end if;

  if v_email is null then
    raise exception 'E-post må fylles ut';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-postadressen ser ikke riktig ut';
  end if;

  if v_phone is null and coalesce(v_settings.require_phone, true) then
    raise exception 'Telefonnummer må fylles ut';
  end if;
  if length(coalesce(v_phone, '')) > 30 then
    raise exception 'Telefonnummeret er for langt';
  end if;

  if v_type = 'bedrift' then
    if v_company is null then
      raise exception 'Firmanavn må fylles ut';
    end if;
    if length(v_company) > 120 then
      raise exception 'Firmanavnet er for langt (høyst 120 tegn)';
    end if;
    if not public.hm_orgnr_gyldig(v_org) then
      raise exception 'Organisasjonsnummeret er ikke gyldig';
    end if;
    -- Ein bedrift blir fakturert på org.nr. Ei adresse som følgde med frå
    -- skjemaet, blir ikkje lagra: ingen har bede om henne.
    v_address := null;
  else
    if v_address is null then
      raise exception 'Fakturaadresse må fylles ut';
    end if;
    if length(v_address) > 200 then
      raise exception 'Adressen er for lang (høyst 200 tegn)';
    end if;
    v_company := null;
    v_org := null;
  end if;

  if length(coalesce(v_comment, '')) > 1000 then
    raise exception 'Kommentaren er for lang (høyst 1000 tegn)';
  end if;

  if v_now then
    v_pickup := v_today;
  else
    v_pickup := p_pickup_date;
    if v_pickup is null then
      raise exception 'Velg hvilken dag du vil hente';
    end if;
    if v_pickup < v_today then
      raise exception 'Hentedagen kan ikke være tilbake i tid';
    end if;
    if v_pickup > v_today + 90 then
      raise exception 'Hentedagen kan være høyst 90 dager fram';
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Bestillingen er tom';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'For mange varelinjer';
  end if;

  /*
   * TAKA.
   *
   * Skjemaet er ope for alle, og kvar bestilling sender ein kvittering til
   * adressa som står i henne. Utan tak kunne kven som helst fylt innboksen til
   * ein framand med kvitteringar frå Hauge Maskin, eller fylt lista til kontoret
   * med falske bestillingar. Ingen av dei trekkjer lageret – det gjer berre
   * godkjenninga – men begge kostar.
   */
  if (select count(*) from public.pipe_orders
       where kind = 'bestilling' and customer_email = v_email
         and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Du har sendt mange bestillinger det siste døgnet. Ring oss, så hjelper vi deg.';
  end if;
  if (select count(*) from public.pipe_orders
       where kind = 'bestilling' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Vi tar imot veldig mange bestillinger akkurat nå. Prøv igjen om litt.';
  end if;

  insert into public.pipe_orders (
    kind, status, stock_drawn_at, customer_type, customer_name, customer_email, customer_phone,
    company, org_number, billing_address, pickup_date, pickup_now, comment
  ) values (
    'bestilling', 'ny', null, v_type, v_name, v_email, v_phone,
    v_company, v_org, v_address, v_pickup, v_now, v_comment
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    -- Sjekka før castane, så ei oppdikta id eller ein tekst i mengdefeltet gir
    -- ei norsk melding og ikkje ein Postgres-feil på engelsk.
    if coalesce(v_line ->> 'pipe_type_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Ukjent vare i bestillingen';
    end if;
    if coalesce(v_line ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Ugyldig mengde på en av linjene';
    end if;

    v_qty := round((v_line ->> 'quantity')::numeric, 2);
    if v_qty <= 0 then
      raise exception 'Ugyldig mengde på en av linjene';
    end if;
    if v_qty > 100000 then
      raise exception 'Mengden er urimelig stor';
    end if;

    select * into v_pipe from public.pipe_types where id = (v_line ->> 'pipe_type_id')::uuid;
    if not found then
      raise exception 'Ukjent vare i bestillingen';
    end if;
    if not v_pipe.active then
      raise exception 'Varen % er ikke tilgjengelig', v_pipe.name;
    end if;
    -- Ein privatperson skal sjå totalprisen før bestillinga blir send. Ei vare
    -- utan pris kan difor ikkje bestillast på nett.
    if v_pipe.price is null then
      raise exception 'Varen % kan ikke bestilles på nett. Ring oss for pris.', v_pipe.name;
    end if;

    v_i := v_i + 1;
    insert into public.pipe_order_lines (
      order_id, pipe_type_id, name, dimension, sku, unit, quantity, unit_price, line_total, sort_order
    ) values (
      v_order.id, v_pipe.id, v_pipe.name, v_pipe.dimension, v_pipe.sku, v_pipe.unit,
      v_qty, v_pipe.price, round(v_pipe.price * v_qty, 2), v_i
    );
    v_total := v_total + round(v_pipe.price * v_qty, 2);
  end loop;

  update public.pipe_orders set total = v_total where id = v_order.id;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number);
end;
$$;

revoke all on function public.pipe_submit_pickup_order(text, text, text, jsonb, text, text, text, text, boolean, date, text) from public;
grant execute on function public.pipe_submit_pickup_order(text, text, text, jsonb, text, text, text, text, boolean, date, text) to anon, authenticated;


-- ── Kunden slår opp si eiga bestilling ──
--
-- Id-en er ein uuid, ikkje ordrenummeret. Ordrenummera går i rekkjefølgje, og
-- med dei kunne kven som helst bladd gjennom andre sine bestillingar. Lenkja er
-- ein nøkkel: den som har henne, ser bestillinga – det same e-posten ho står i
-- allereie viser. Uttak blir aldri gitt ut denne vegen.

create or replace function public.pipe_get_pickup_order(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'created_at', o.created_at,
    'status', o.status,
    'pickup_date', o.pickup_date,
    'pickup_now', o.pickup_now,
    'customer_type', o.customer_type,
    'customer_name', o.customer_name,
    'customer_email', o.customer_email,
    'customer_phone', o.customer_phone,
    'company', o.company,
    'org_number', o.org_number,
    'billing_address', o.billing_address,
    'comment', o.comment,
    'customer_message', o.customer_message,
    'handled_at', o.handled_at,
    'total', o.total,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', l.name, 'dimension', l.dimension, 'sku', l.sku, 'unit', l.unit,
        'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total
      ) order by l.sort_order)
      from public.pipe_order_lines l
      where l.order_id = o.id
    ), '[]'::jsonb),
    -- Når kunden fekk kvittering, klar og avvist. Kontorets varsel er ikkje
    -- kunden si sak.
    'emails', coalesce((
      select jsonb_object_agg(e.type, e.sent_at)
        from public.pipe_order_emails e
       where e.order_id = o.id and e.sent_at is not null and e.type <> 'kontor'
    ), '{}'::jsonb)
  )
  from public.pipe_orders o
  where o.id = p_id and o.kind = 'bestilling';
$$;

revoke all on function public.pipe_get_pickup_order(uuid) from public;
grant execute on function public.pipe_get_pickup_order(uuid) to anon, authenticated;


-- ── Kontoret godkjenner ──

create or replace function public.pipe_approve_pickup_order(p_id uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_line record;
  v_balance numeric;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if length(coalesce(v_message, '')) > 1000 then
    raise exception 'Meldingen er for lang (høyst 1000 tegn)';
  end if;

  -- Låsen: to faner som godkjenner samtidig, ventar på kvarandre her. Den andre
  -- ser status 'behandlet' og blir avvist, så lageret blir trekt éin gong.
  select * into v_order from public.pipe_orders where id = p_id for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;
  if v_order.kind <> 'bestilling' then
    raise exception 'Dette er et uttak, ikke en bestilling';
  end if;
  if v_order.status <> 'ny' then
    raise exception 'Bestillingen er allerede behandlet';
  end if;

  -- Beholdninga får gå i minus, som ved uttak: det er reell informasjon om at
  -- kontoret godkjende meir enn lageret viste.
  for v_line in
    select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_id order by sort_order
  loop
    if v_line.pipe_type_id is not null then
      update public.pipe_types set stock = stock - v_line.quantity
        where id = v_line.pipe_type_id
        returning stock into v_balance;

      insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note, created_by)
      values (v_line.pipe_type_id, v_line.name, -v_line.quantity, v_balance, 'bestilling', p_id,
              'Bestilling #' || v_order.order_number || ' godkjent', auth.uid());
    end if;
  end loop;

  -- Status og trekktidspunkt i éi setning. Regelen pipe_orders_bestilling_lager
  -- krev det.
  update public.pipe_orders
     set status = 'behandlet', stock_drawn_at = now(), handled_at = now(),
         handled_by = auth.uid(), customer_message = v_message
   where id = p_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.pipe_approve_pickup_order(uuid, text) from public, anon;
grant execute on function public.pipe_approve_pickup_order(uuid, text) to authenticated;


-- ── Kontoret avviser ──
--
-- Både før og etter godkjenning: ein kunde som aldri kjem, gjer at ei godkjend
-- bestilling må kunne avvisast òg. Var lageret trekt, går røra tilbake.

create or replace function public.pipe_reject_pickup_order(p_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_line record;
  v_balance numeric;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if v_message is null then
    raise exception 'Skriv en begrunnelse til kunden';
  end if;
  if length(v_message) > 1000 then
    raise exception 'Meldingen er for lang (høyst 1000 tegn)';
  end if;

  select * into v_order from public.pipe_orders where id = p_id for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;
  if v_order.kind <> 'bestilling' then
    raise exception 'Dette er et uttak, ikke en bestilling';
  end if;
  if v_order.status not in ('ny', 'behandlet') then
    raise exception 'Bestillingen kan ikke avvises nå';
  end if;
  if v_order.invoice_id is not null then
    raise exception 'Bestillingen er fakturert. Slett fakturagrunnlaget først.';
  end if;

  if v_order.stock_drawn_at is not null then
    for v_line in
      select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_id order by sort_order
    loop
      if v_line.pipe_type_id is not null then
        update public.pipe_types set stock = stock + v_line.quantity
          where id = v_line.pipe_type_id
          returning stock into v_balance;

        insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note, created_by)
        values (v_line.pipe_type_id, v_line.name, v_line.quantity, v_balance, 'avvist', p_id,
                'Avvist bestilling #' || v_order.order_number, auth.uid());
      end if;
    end loop;
  end if;

  update public.pipe_orders
     set status = 'avvist', stock_drawn_at = null, handled_at = now(),
         handled_by = auth.uid(), customer_message = v_message
   where id = p_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.pipe_reject_pickup_order(uuid, text) from public, anon;
grant execute on function public.pipe_reject_pickup_order(uuid, text) to authenticated;
