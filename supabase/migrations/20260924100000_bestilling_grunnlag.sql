-- Bestilling for henting: grunnlaget.
--
-- Ei bestilling er eit uttak meldt på førehand. Ho blir ei rad i pipe_orders
-- med kind = 'bestilling', og skil seg frå eit uttak berre i NÅR lageret blir
-- trekt: ved godkjenning, ikkje ved innsending. Heile resonnementet står i
-- docs/superpowers/specs/2026-09-24-bestilling-for-henting-design.md.
--
-- Fila kan køyrast om att på ein base som er i bruk. omkoyring.test.mjs prøver
-- nettopp det, og kvar setning her er skriven for å tole det.


-- ── 1. Nye kolonner på pipe_orders ──

alter table public.pipe_orders
  add column if not exists kind text not null default 'uttak',
  add column if not exists stock_drawn_at timestamptz,
  add column if not exists pickup_date date,
  add column if not exists pickup_now boolean not null default false,
  add column if not exists customer_type text,
  add column if not exists org_number text,
  add column if not exists billing_address text,
  add column if not exists customer_message text;

/*
 * REKKJEFØLGJA ER MED VILJE.
 *
 * stock_drawn_at kom til utan standard, og kvart uttak som finst får
 * tidspunktet det blei sendt inn – det var då lageret blei trekt. Først
 * DERETTER blir standarden now(). Stod standarden der frå starten, ville kvart
 * gamle uttak fått tidspunktet migrasjonen køyrde.
 *
 * Berre uttak blir fylte. Ei bestilling som ventar skal ha null: det er nettopp
 * det som seier at lageret ikkje er trekt. Ved omkøyring finst det ingen uttak
 * utan tidspunkt, så setninga rører då ingenting.
 */
update public.pipe_orders
   set stock_drawn_at = created_at
 where kind = 'uttak' and stock_drawn_at is null;

alter table public.pipe_orders alter column stock_drawn_at set default now();

alter table public.pipe_orders drop constraint if exists pipe_orders_kind_check;
alter table public.pipe_orders add constraint pipe_orders_kind_check
  check (kind in ('uttak', 'bestilling'));

alter table public.pipe_orders drop constraint if exists pipe_orders_customer_type_check;
alter table public.pipe_orders add constraint pipe_orders_customer_type_check
  check (customer_type is null or customer_type in ('privat', 'bedrift'));

/*
 * REGELEN OM LAGER OG STATUS.
 *
 * For ei bestilling seier statusen alltid om lageret er trekt: «ny» og
 * «avvist» betyr ikkje trekt, «behandlet» og «levert» betyr trekt.
 *
 * Utan denne kunne ein vanleg `update ... set status = 'behandlet'` –
 * statusveljaren i adminpanelet, eller «Merk som behandlet» på fleire rader –
 * gjort ei bestilling «klar til henting» utan at eit einaste rør var trekt.
 * Med han er godkjenningsfunksjonen den einaste vegen frå «ny» til «behandlet».
 */
alter table public.pipe_orders drop constraint if exists pipe_orders_bestilling_lager;
alter table public.pipe_orders add constraint pipe_orders_bestilling_lager check (
  kind <> 'bestilling'
  or (status in ('ny', 'avvist') and stock_drawn_at is null)
  or (status in ('behandlet', 'levert') and stock_drawn_at is not null)
);

-- Det kontoret og e-posten treng for å gjere jobben sin.
alter table public.pipe_orders drop constraint if exists pipe_orders_bestilling_felt;
alter table public.pipe_orders add constraint pipe_orders_bestilling_felt check (
  kind <> 'bestilling'
  or (customer_type is not null and pickup_date is not null and customer_email is not null)
);

-- Stripa «Venter på godkjenning» spør etter nettopp dette, kvart minutt.
create index if not exists idx_pipe_orders_kind_status on public.pipe_orders (kind, status);


-- ── 2. Innstillingane ──

alter table public.pipe_settings
  add column if not exists accept_orders boolean not null default false,
  add column if not exists order_email text,
  add column if not exists payment_terms_days integer not null default 14;

alter table public.pipe_settings drop constraint if exists pipe_settings_payment_terms_check;
alter table public.pipe_settings add constraint pipe_settings_payment_terms_check
  check (payment_terms_days between 0 and 90);

/*
 * BRYTAREN KAN IKKJE SLÅAST PÅ FØR SELJAREN FINST.
 *
 * Vilkåra kunden godtek, og angreskjemaet kunden skal kunne sende, må seie kven
 * som sel og kvar ei angremelding skal. Utan firmanamn, org.nr., adresse og
 * e-post er begge ugyldige – og eit skjema som tek imot bestillingar frå
 * privatpersonar utan dei, bryt angrerettlova frå første bestilling.
 */
alter table public.pipe_settings drop constraint if exists pipe_settings_accept_orders_check;
alter table public.pipe_settings add constraint pipe_settings_accept_orders_check check (
  not accept_orders
  or (
    nullif(btrim(company_name), '') is not null
    and nullif(btrim(coalesce(org_number, '')), '') is not null
    and nullif(btrim(coalesce(address, '')), '') is not null
    and nullif(btrim(coalesce(email, '')), '') is not null
  )
);

/*
 * EIGA VISNING, IKKJE NYE KOLONNER PÅ pipe_public_settings.
 *
 * `create or replace view` kan leggje til kolonner bakerst, men aldri fjerne
 * nokon. Ved omkøyring av supabase-setup.sql køyrer 20260903090200 først og
 * lagar pipe_public_settings med sine kolonner – mot ei visning som då ville
 * hatt to fleire. Postgres nektar («cannot drop columns from view»), og heile
 * fila stoppar på ein base som er i bruk. Ei eiga visning har ingen eldre
 * definisjon å kollidere med.
 *
 * order_email er ikkje med: varseladressa er kontoret sin.
 */
create or replace view public.pipe_public_order_settings as
  select id, accept_orders, payment_terms_days
    from public.pipe_settings;

comment on view public.pipe_public_order_settings is
  'Det bestillingsskjemaet treng å vite: om det er ope, og betalingsfristen. Varseladressa er ikkje med.';

-- REVOKE FØR GRANT, same grunn som i 20260903090200: Supabase deler ut alt på
-- nye visningar til anon, og ei visning utan security_invoker skriv rett
-- gjennom til tabellen bak.
revoke all on public.pipe_public_order_settings from public, anon, authenticated;
grant select on public.pipe_public_order_settings to anon, authenticated;


-- ── 3. E-postloggen ──
--
-- Éi rad per e-post som er send, eller som er i ferd med å bli send. Den unike
-- nøkkelen på (bestilling, type) er låsen som hindrar at same e-post går to
-- gonger – sjå pipe_email_claim i 20260924100200.

create table if not exists public.pipe_order_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pipe_orders(id) on delete cascade,
  type text not null check (type in ('kvittering', 'kontor', 'klar', 'avvist')),
  recipient text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  unique (order_id, type)
);

create index if not exists idx_pipe_order_emails_claimed on public.pipe_order_emails (claimed_at desc);
create index if not exists idx_pipe_order_emails_recipient on public.pipe_order_emails (recipient, claimed_at desc);

alter table public.pipe_order_emails enable row level security;

drop policy if exists "pipe_order_emails les" on public.pipe_order_emails;
create policy "pipe_order_emails les" on public.pipe_order_emails
  for select to authenticated using (public.hm_er_kontor());

-- Kontoret les loggen på bestillingskortet. Ingen skriv i han utanom
-- funksjonane, som køyrer med eigaren sine rettar.
revoke all on public.pipe_order_emails from public, anon, authenticated;
grant select on public.pipe_order_emails to authenticated;


-- ── 4. Sletting: berre det som faktisk blei teke ut, går tilbake ──
--
-- Fram til no hadde kvar ordre trekt lageret i det ho blei sendt inn, så
-- sletting la alltid røra tilbake. Ei bestilling som aldri blei godkjend, har
-- aldri teke noko – og å leggje tilbake røra hennar ville lagt til rør som
-- aldri var borte.

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
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  -- Låsen: ei godkjenning eller avvising av same bestilling ventar til slettinga
  -- er ferdig, og omvendt – elles kunne lageret bli lagt tilbake to gonger, eller
  -- aldri.
  select order_number, stock_drawn_at into v_number, v_drawn
    from public.pipe_orders where id = p_order_id
     for update;
  if not found then
    raise exception 'Fant ikke bestillingen';
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


-- ── 5. Fakturagrunnlaget tek berre det som har forlate lageret ──
--
-- Ei bestilling som ventar, eller som er avvist, har ingen rør på seg å
-- fakturere. Resten av kroppen er som i 20260903093000, pluss radlåsen.

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

  -- Låsen: ei avvising av ei av bestillingane ventar til fakturaen er laga, og
  -- omvendt. Utan han kunne ei bestilling bli avvist mellom sjekkane under og
  -- oppdateringa nedst, og få faktura likevel. Sortert, så to fakturaer som
  -- deler bestillingar, ikkje kan låse kvarandre fast.
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
