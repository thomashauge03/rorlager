-- Sikring av uttak og fakturagrunnlag. Seks hol funne i revisjonen 14. oktober
-- 2026, alle små, alle der pengar eller lagertal kunne bli feil:
--
-- 1. Ein innlogga framand (sjølvregistrert, ingen rad i system_users) blei
--    rekna som tilsett: uttak utan e-post, rett inn i fakturagrunnlaget.
-- 2. Uttak utan innlogging hadde ingen tak i basen, og ingen lengdegrenser –
--    eit skript kunne tømme lagertala og fylle basen med «signaturar».
-- 3. Same uttak kunne bli registrert to gonger når svaret forsvann på veg
--    tilbake (dårleg dekning i lageret): dobbelt lagertrekk, dobbel faktura.
-- 4. Eit fakturert uttak kunne slettast. Røra gjekk tilbake på lageret, medan
--    fakturagrunnlaget stod att med den gamle summen.
-- 5. Eit fakturagrunnlag kunne lagast med linjer utan pris – og etterpå nekta
--    pipe_price_line å prise dei, fordi ordren var fakturert. Beløpet var tapt.
-- 6. «Avvist» på eit uttak gjorde ingenting med lageret, og uttaket kom med på
--    faktura likevel.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.


-- ── 3. Kvar innsending har ein referanse ──

alter table public.pipe_orders add column if not exists client_ref uuid;
create unique index if not exists idx_pipe_orders_client_ref on public.pipe_orders (client_ref) where client_ref is not null;

comment on column public.pipe_orders.client_ref is
  'Laga i nettlesaren per innsending. Kjem same referanse igjen, er det same uttak sendt på nytt – og svaret blir det første.';


-- ── 6. Eit uttak kan ikkje avvisast ──
--
-- Eit uttak er røyr som alt har forlate hylla. «Avvist» høyrer til
-- bestillingane, der lageret ikkje er trekt før kontoret godkjenner. Ingen
-- uttak i den levande basen har status avvist (sjekka 14.10.2026).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipe_orders_uttak_ikkje_avvist') then
    alter table public.pipe_orders
      add constraint pipe_orders_uttak_ikkje_avvist check (not (kind = 'uttak' and status = 'avvist'));
  end if;
end $$;


-- ── Kvitteringa for eit uttak ──
--
-- Éin stad, så eit uttak som blir sendt på nytt får nøyaktig same svar som
-- første gongen – og ikkje ei kvittering bygd på ein annan måte.

create or replace function public.pipe_uttak_svar(p_order_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'created_at', o.created_at,
    'customer_name', o.customer_name,
    'company', o.company,
    'project', o.project,
    'comment', o.comment,
    'total', o.total,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', l.name,
               'dimension', l.dimension,
               'sku', l.sku,
               'unit', l.unit,
               'quantity', l.quantity,
               'unit_price', l.unit_price,
               'line_total', l.line_total,
               'annet', l.is_annet
             ) order by l.sort_order)
        from public.pipe_order_lines l
       where l.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.pipe_orders o
  where o.id = p_order_id
$$;

revoke all on function public.pipe_uttak_svar(uuid) from public, anon, authenticated;


-- ── 1, 2 og 3: Uttaket ──
--
-- Same reglar som 20261014100000_ansatt_rolle.sql, med fire endringar:
--   * «tilsett» tyder ei rolle i system_users, ikkje berre ei innlogging,
--   * kundar har tak per e-post og totalt, og lengdegrenser på kvart felt,
--   * signaturen må vere eit PNG-bilete av rimeleg storleik,
--   * p_client_ref gjer ei ny innsending av same uttak ufarleg.
-- Den gamle signaturen blir fjerna, elles ville PostgREST hatt to å velje
-- mellom. Den nye parameteren har standardverdi, så ein eldre klient treffer.

drop function if exists public.pipe_submit_order(text, jsonb, text, text, text, text, text, text, uuid);

create or replace function public.pipe_submit_order(
  p_customer_name text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_company text default null,
  p_project text default null,
  p_comment text default null,
  p_signature text default null,
  p_project_id uuid default null,
  p_client_ref uuid default null
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
  -- Ei rolle, ikkje berre ei innlogging: sjølvregistrering er open, og ein
  -- framand med konto er ein kunde som alle andre.
  v_tilsett boolean := auth.uid() is not null and public.hm_rolle() is not null;
  v_balance numeric;
  v_project_id uuid;
  v_project text := nullif(btrim(coalesce(p_project, '')), '');
  v_phone text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_signature text := nullif(p_signature, '');
  v_prosjekt public.projects;
  v_finst uuid;
begin
  -- Same uttak sendt på nytt: svaret frå første gong, ingenting nytt. Før alt
  -- anna, så ein ny freistnad ikkje tel mot taka eller blir stoppa av dei.
  -- Berre for den same avsendaren: ein referanse frå nokon andre gir ingenting.
  if p_client_ref is not null then
    select id into v_finst from public.pipe_orders
     where client_ref = p_client_ref
       and created_by is not distinct from (case when v_tilsett then auth.uid() end);
    if found then
      return public.pipe_uttak_svar(v_finst);
    end if;
    -- Referansen finst, men på nokon andre: aldri deira kvittering, og ikkje
    -- ein engelsk feil frå den unike indeksen.
    if exists (select 1 from public.pipe_orders where client_ref = p_client_ref) then
      raise exception 'Uttaket kunne ikke sendes. Last siden på nytt og prøv igjen.';
    end if;
  end if;

  if v_tilsett then
    -- Registrert på brukaren, uansett kva skjemaet sende.
    v_name := public.hm_mitt_namn();
    v_email := nullif(auth.jwt() ->> 'email', '');
  else
    v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
    v_email := nullif(btrim(coalesce(p_customer_email, '')), '');
  end if;

  if v_name is null then
    raise exception 'Navn må fylles ut';
  end if;

  if v_tilsett then
    if p_project_id is not null then
      select * into v_prosjekt from public.projects where id = p_project_id;
      if not found or v_prosjekt.status <> 'aktiv' then
        raise exception 'Prosjektet finnes ikke eller er avsluttet. Velg et annet.';
      end if;
      v_project_id := v_prosjekt.id;
      v_project := public.pipe_prosjekttekst(v_prosjekt.project_number, v_prosjekt.name);
    elsif v_project is null then
      raise exception 'Velg hvilket prosjekt varene skal på';
    end if;
  elsif v_email is null then
    raise exception 'E-post må fylles ut. Har du ikke e-post, skriv «ingen».';
  end if;

  -- Lengdene. Skjemaet held seg langt innanfor; dette er for den som sender
  -- rett mot funksjonen.
  if length(v_name) > 100 then raise exception 'Navnet er for langt (høyst 100 tegn)'; end if;
  if length(coalesce(v_email, '')) > 254 then raise exception 'E-postadressen er for lang'; end if;
  if length(coalesce(v_phone, '')) > 30 then raise exception 'Telefonnummeret er for langt'; end if;
  if length(coalesce(v_company, '')) > 120 then raise exception 'Firmanavnet er for langt (høyst 120 tegn)'; end if;
  if length(coalesce(v_project, '')) > 200 then raise exception 'Prosjektet er for langt (høyst 200 tegn)'; end if;
  if length(coalesce(v_comment, '')) > 1000 then raise exception 'Kommentaren er for lang (høyst 1000 tegn)'; end if;
  -- Ein signatur er eit PNG frå teikneflata, ikkje kva som helst. 300 kB er
  -- rikeleg for ei strek-teikning og stoppar den som vil fylle basen.
  if v_signature is not null
     and (v_signature !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(v_signature) > 300000) then
    raise exception 'Signaturen er ugyldig. Tøm feltet og skriv på nytt.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Handlekurven er tom';
  end if;
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'For mange varelinjer';
  end if;
  if public.pipe_tal_annet(p_lines) > 10 then
    raise exception 'Høyst 10 «annet»-linjer per uttak';
  end if;

  /*
   * TAKA, berre for kundar. Ein tilsett er kjend og står ansvarleg for uttaka
   * sine; ein kunde utan innlogging kan vere eit skript.
   *
   * Låsen gjer at to innsendingar samstundes ikkje begge ser «9 av 10» og går
   * gjennom. Same mønster som bestillinga (20260924100100).
   */
  if not v_tilsett then
    perform pg_advisory_xact_lock(hashtext('pipe_submit_order'));
    if (select count(*) from public.pipe_orders
         where kind = 'uttak' and created_by is null and lower(customer_email) = lower(v_email)
           and lower(v_email) <> 'ingen'
           and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Du har sendt mange uttak den siste timen. Si fra til lageret, så hjelper vi deg.';
    end if;
    if (select count(*) from public.pipe_orders
         where kind = 'uttak' and created_by is null
           and created_at > now() - interval '1 hour') >= 60 then
      raise exception 'Det er sendt veldig mange uttak akkurat nå. Prøv igjen om litt, eller si fra til lageret.';
    end if;
  end if;

  insert into public.pipe_orders (
    customer_name, customer_phone, customer_email, company, project, project_id, comment, signature,
    created_by, client_ref
  ) values (
    v_name,
    v_phone,
    v_email,
    v_company,
    v_project,
    v_project_id,
    v_comment,
    v_signature,
    case when v_tilsett then auth.uid() end,
    p_client_ref
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_i := v_i + 1;

    if v_line ? 'annet' then
      perform public.pipe_annet_linje(v_order.id, v_line, v_i, v_name);
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
  end loop;

  update public.pipe_orders set total = v_total where id = v_order.id;

  return public.pipe_uttak_svar(v_order.id);
end;
$$;

revoke all on function public.pipe_submit_order(text, jsonb, text, text, text, text, text, text, uuid, uuid) from public;
grant execute on function public.pipe_submit_order(text, jsonb, text, text, text, text, text, text, uuid, uuid) to anon, authenticated;


-- ── 4. Eit fakturert uttak kan ikkje slettast ──
--
-- Resten av kroppen er som i 20260924100000.

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
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select order_number, stock_drawn_at, invoice_id into v_number, v_drawn, v_invoice
    from public.pipe_orders where id = p_order_id
     for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;
  if v_invoice is not null then
    raise exception 'Bestillingen er fakturert. Slett fakturagrunnlaget først.';
  end if;

  if v_drawn is not null then
    for v_line in
      select pipe_type_id, name, quantity from public.pipe_order_lines where order_id = p_order_id
    loop
      if v_line.pipe_type_id is not null then
        update public.pipe_types set stock = stock + v_line.quantity
          where id = v_line.pipe_type_id
          returning stock into v_balance;

        insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
        values (v_line.pipe_type_id, v_line.name, v_line.quantity, v_balance, 'sletting',
                'Slettet bestilling #' || v_number, auth.uid());
      end if;
    end loop;
  end if;

  delete from public.pipe_orders where id = p_order_id;
end;
$$;

revoke all on function public.pipe_delete_order(uuid) from public, anon;
grant execute on function public.pipe_delete_order(uuid) to authenticated;


-- ── 5 og 6. Fakturagrunnlaget ──
--
-- Som i 20260924100000, pluss to sperrer: ingen linjer utan pris, og ingen
-- avviste ordrar. Ei linje utan pris kan prisast i Bestillinger så lenge ordren
-- ikkje er fakturert – etterpå er det for seint, så sperra må stå her.

create or replace function public.pipe_create_invoice(
  p_customer_name text,
  p_period_from date,
  p_period_to date,
  p_order_ids uuid[],
  p_total numeric,
  p_note text default null
)
returns public.pipe_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.pipe_invoices;
  v_already int;
  v_finnes int;
  v_ikkje_trekt int;
  v_avvist int;
  v_utan_pris int;
  v_sum numeric;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'Ingen bestillinger valgt';
  end if;
  if p_period_from is null or p_period_to is null then
    raise exception 'Både fra- og til-dato må fylles ut';
  end if;

  perform 1 from public.pipe_orders where id = any(p_order_ids) order by id for update;

  select count(*) into v_finnes from public.pipe_orders where id = any(p_order_ids);
  if v_finnes <> array_length(p_order_ids, 1) then
    raise exception 'Fant ikke alle bestillingene. Last siden på nytt.';
  end if;

  select count(*) into v_already
    from public.pipe_orders
   where id = any(p_order_ids) and invoice_id is not null;
  if v_already > 0 then
    raise exception '% av bestillingene er allerede fakturert', v_already;
  end if;

  select count(*) into v_ikkje_trekt
    from public.pipe_orders
   where id = any(p_order_ids) and stock_drawn_at is null;
  if v_ikkje_trekt > 0 then
    raise exception '% av bestillingene er ikke godkjent', v_ikkje_trekt;
  end if;

  select count(*) into v_avvist
    from public.pipe_orders
   where id = any(p_order_ids) and status = 'avvist';
  if v_avvist > 0 then
    raise exception '% av bestillingene er avvist', v_avvist;
  end if;

  select count(*) into v_utan_pris
    from public.pipe_order_lines
   where order_id = any(p_order_ids) and (unit_price is null or line_total is null);
  if v_utan_pris > 0 then
    raise exception '% linjer mangler pris. Sett prisen i Bestillinger før grunnlaget lages – etterpå er det for sent.', v_utan_pris;
  end if;

  select coalesce(sum(total), 0) into v_sum
    from public.pipe_orders where id = any(p_order_ids);

  insert into public.pipe_invoices (customer_name, period_from, period_to, total, note)
  values (p_customer_name, p_period_from, p_period_to, v_sum, p_note)
  returning * into v_invoice;

  update public.pipe_orders
     set invoice_id = v_invoice.id
   where id = any(p_order_ids);

  return v_invoice;
end;
$$;

revoke all on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) from public, anon;
grant execute on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) to authenticated;
