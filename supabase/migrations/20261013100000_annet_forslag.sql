-- «Annet»: det katalogen manglar, med eigne ord, rett i kurva.
--
-- Ei annet-linje går med uttaket eller bestillinga som ei vanleg linje, men
-- utan vare og utan pris, og blir samstundes eit forslag til kontoret: opprett
-- vara i katalogen, eller set berre pris på denne eine linja. Over tid fyller
-- katalogen seg med det folk faktisk tek.
--
-- Design: docs/superpowers/specs/2026-10-13-annet-forslag-design.md


-- ── 1. Linja veit at ho er «annet» ──
--
-- pipe_type_id = null tyder i dag òg «katalogvara er sletta» (on delete set
-- null). Dei to skal ikkje forvekslast: ei sletta vare er ikkje eit forslag.

alter table public.pipe_order_lines
  add column if not exists is_annet boolean not null default false;


-- ── 2. Forslaga ──
--
-- Éi rad per annet-linje. Forslaget overlever at ordren blir sletta: det er
-- tilbakemeldinga som er verdien, ikkje ordren.

create table if not exists public.pipe_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid references public.pipe_orders(id) on delete set null,
  order_line_id uuid references public.pipe_order_lines(id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  dimension text check (length(dimension) <= 60),
  unit text not null check (unit in ('m', 'stk')),
  quantity numeric not null check (quantity > 0),
  note text check (length(note) <= 300),
  from_employee boolean not null default false,
  submitted_by text,
  status text not null default 'ny' check (status in ('ny', 'opprettet', 'engangs', 'avvist')),
  pipe_type_id uuid references public.pipe_types(id) on delete set null,
  handled_at timestamptz,
  handled_by uuid
);

create index if not exists idx_pipe_suggestions_status on public.pipe_suggestions (status, created_at desc);
create index if not exists idx_pipe_suggestions_order on public.pipe_suggestions (order_id);

alter table public.pipe_suggestions enable row level security;

drop policy if exists "pipe_suggestions les" on public.pipe_suggestions;
create policy "pipe_suggestions les" on public.pipe_suggestions
  for select to authenticated using (public.hm_er_kontor());

drop policy if exists "pipe_suggestions endre" on public.pipe_suggestions;
create policy "pipe_suggestions endre" on public.pipe_suggestions
  for update to authenticated using (public.hm_er_kontor()) with check (public.hm_er_kontor());

-- Ingen insert- eller delete-regel: radene blir skrivne av innsendingsfunksjonane,
-- som køyrer med eigaren sine rettar, og kontoret lukkar forslag i staden for å
-- slette dei.
revoke all on public.pipe_suggestions from public, anon, authenticated;
grant select, update on public.pipe_suggestions to authenticated;


-- ── 3. Éi annet-linje, felles for uttak og bestilling ──
--
-- Validerer, skriv linja og forslaget, og gir tilbake linja slik kvitteringa
-- viser henne. Lageret blir ikkje rørt: det finst inga vare å trekkje frå.

create or replace function public.pipe_annet_linje(
  p_order_id uuid,
  p_line jsonb,
  p_sort integer,
  p_submitted_by text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_a jsonb := p_line -> 'annet';
  v_name text;
  v_dim text;
  v_unit text;
  v_note text;
  v_qty numeric;
  v_line_id uuid;
begin
  -- Typen før feltene: ->> på noko anna enn eit objekt gir ein engelsk
  -- Postgres-feil og ikkje ei melding kunden forstår.
  if coalesce(jsonb_typeof(v_a), '') <> 'object' then
    raise exception 'Ugyldig linje i kurven';
  end if;

  v_name := nullif(btrim(coalesce(v_a ->> 'name', '')), '');
  v_dim := nullif(btrim(coalesce(v_a ->> 'dimension', '')), '');
  v_unit := lower(btrim(coalesce(v_a ->> 'unit', '')));
  v_note := nullif(btrim(coalesce(v_a ->> 'note', '')), '');

  if v_name is null then
    raise exception 'Skriv hva varen er';
  end if;
  if length(v_name) > 120 then
    raise exception 'Navnet på varen er for langt (høyst 120 tegn)';
  end if;
  if length(coalesce(v_dim, '')) > 60 then
    raise exception 'Dimensjonen er for lang (høyst 60 tegn)';
  end if;
  if v_unit not in ('m', 'stk') then
    raise exception 'Velg meter eller stykk';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Merknaden er for lang (høyst 300 tegn)';
  end if;

  if coalesce(p_line ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'Ugyldig mengde på en av linjene';
  end if;
  v_qty := round((p_line ->> 'quantity')::numeric, 2);
  if v_qty <= 0 then
    raise exception 'Ugyldig mengde på en av linjene';
  end if;
  if v_qty > 100000 then
    raise exception 'Mengden er urimelig stor';
  end if;

  insert into public.pipe_order_lines (
    order_id, pipe_type_id, name, dimension, sku, unit, quantity, unit_price, line_total, sort_order, is_annet
  ) values (
    p_order_id, null, v_name, v_dim, null, v_unit, v_qty, null, null, p_sort, true
  )
  returning id into v_line_id;

  insert into public.pipe_suggestions (
    order_id, order_line_id, name, dimension, unit, quantity, note, from_employee, submitted_by
  ) values (
    p_order_id, v_line_id, v_name, v_dim, v_unit, v_qty, v_note, auth.uid() is not null, p_submitted_by
  );

  return jsonb_build_object(
    'name', v_name,
    'dimension', v_dim,
    'sku', null,
    'unit', v_unit,
    'quantity', v_qty,
    'unit_price', null,
    'line_total', null,
    'annet', true
  );
end;
$$;

-- Berre for innsendingsfunksjonane, som køyrer som eigaren. Kalla direkte ville
-- ho skrive linjer på kven som helst si ordre.
revoke all on function public.pipe_annet_linje(uuid, jsonb, integer, text) from public, anon, authenticated;


-- Tal annet-linjer i ei innsending. Tak på ti: nok til ein travel dag på
-- lageret, og ei sperre mot at forslagslista blir fylt av eitt skript.
create or replace function public.pipe_tal_annet(p_lines jsonb)
returns integer
language sql
immutable
set search_path = public
as $$
  select count(*)::integer from jsonb_array_elements(p_lines) e where e ? 'annet';
$$;

revoke all on function public.pipe_tal_annet(jsonb) from public, anon, authenticated;


-- ── 4. Uttaket ──
--
-- Same signatur og same reglar som 20260928100000_uttak_pa_brukaren.sql. Det
-- nye er greina for annet-linjer og at svarlinjene seier om dei er det.

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
  if public.pipe_tal_annet(p_lines) > 10 then
    raise exception 'Høyst 10 «annet»-linjer per uttak';
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
    v_i := v_i + 1;

    if v_line ? 'annet' then
      v_lines_out := v_lines_out || public.pipe_annet_linje(v_order.id, v_line, v_i, v_name);
      continue;
    end if;

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
      'line_total', case when v_type.price is null then null else round(v_type.price * v_qty, 2) end,
      'annet', false
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


-- ── 5. Bestillinga ──
--
-- Same signatur og same reglar som 20260924100100_bestilling_funksjonar.sql.
-- Ei annet-linje er ein førespurnad: ho tel ikkje i summen kunden bind seg
-- til, og kontoret kan ikkje godkjenne før ho har fått pris (sjå punkt 7).

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
  -- Same mønster som i supabase/functions/_shared/epostadresse.ts, der det står
  -- kvifor det er strengt. Endrar du det eine, endrar du det andre.
  if length(v_email) > 254
     or v_email !~ '^[A-Za-z0-9_+-]+(\.[A-Za-z0-9_+-]+)*@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$' then
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
  if public.pipe_tal_annet(p_lines) > 10 then
    raise exception 'Høyst 10 «annet»-linjer per bestilling';
  end if;

  /*
   * TAKA og LÅSEN: sjå 20260924100100_bestilling_funksjonar.sql for kvifor.
   */
  perform pg_advisory_xact_lock(hashtext('pipe_submit_pickup_order'));

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
    v_i := v_i + 1;

    if v_line ? 'annet' then
      perform public.pipe_annet_linje(v_order.id, v_line, v_i, v_name);
      continue;
    end if;

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
    -- Ein privatperson skal sjå totalprisen før bestillinga blir send. Ei
    -- katalogvare utan pris kan difor ikkje bestillast på nett. (Ei annet-linje
    -- er noko anna: ho er ein førespurnad, ikkje ein del av det bindande kjøpet.)
    if v_pipe.price is null then
      raise exception 'Varen % kan ikke bestilles på nett. Ring oss for pris.', v_pipe.name;
    end if;

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


-- ── 6. Kunden slår opp bestillinga: linjene seier om dei er annet ──

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
        'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total,
        'annet', l.is_annet
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


-- ── 7. Godkjenning: ikkje før annet-linjene har pris ──
--
-- E-posten om at bestillinga er klar, er der kunden får prisen. Ei godkjend
-- bestilling utan pris på ein førespurnad ville sendt ein e-post utan det
-- kunden venta på. Sperra ligg her og ikkje berre i knappen.

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
  if exists (
    select 1 from public.pipe_order_lines
     where order_id = p_id and is_annet and unit_price is null
  ) then
    raise exception 'Sett pris på annet-linjene før du godkjenner';
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


-- ── 8. Kontoret set pris på éi linje ──
--
-- For annet-linjer, og for ei katalogvare som mangla pris då ho blei teken ut.
-- Ordretotalen blir rekna på nytt frå linjene, så han aldri kjem i utakt med
-- dei. Ein fakturert ordre er låst: grunnlaget er sendt, og ein pris endra
-- etterpå ville ikkje stått på det.

create or replace function public.pipe_price_line(p_line_id uuid, p_unit_price numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.pipe_order_lines;
  v_order public.pipe_orders;
  v_price numeric := round(p_unit_price, 2);
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'Skriv en gyldig pris';
  end if;
  if v_price > 10000000 then
    raise exception 'Prisen er urimelig stor';
  end if;

  select * into v_line from public.pipe_order_lines where id = p_line_id;
  if not found then
    raise exception 'Fant ikke linjen';
  end if;

  -- Låsen på ordren: to som set pris samtidig, får kvar sin total rekna
  -- etter kvarandre og ikkje over kvarandre.
  select * into v_order from public.pipe_orders where id = v_line.order_id for update;
  if v_order.invoice_id is not null then
    raise exception 'Ordren er fakturert. Slett fakturagrunnlaget først.';
  end if;

  update public.pipe_order_lines
     set unit_price = v_price, line_total = round(v_price * quantity, 2)
   where id = p_line_id
  returning * into v_line;

  update public.pipe_orders
     set total = coalesce((
       select sum(line_total) from public.pipe_order_lines where order_id = v_order.id and line_total is not null
     ), 0)
   where id = v_order.id;

  return to_jsonb(v_line);
end;
$$;

revoke all on function public.pipe_price_line(uuid, numeric) from public, anon;
grant execute on function public.pipe_price_line(uuid, numeric) to authenticated;
