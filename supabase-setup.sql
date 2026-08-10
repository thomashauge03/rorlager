-- ============================================================================
--  RØRLAGER – komplett databaseoppsett
--
--  Slik tar du det i bruk:
--    1. Åpne Supabase-prosjektet ditt -> SQL Editor -> New query
--    2. Lim inn HELE denne filen og trykk Run
--    3. Sjekk at .env peker på samme prosjekt (VITE_SUPABASE_URL / _PUBLISHABLE_KEY)
--
--  Filen er satt sammen av migrasjonene i supabase/migrations/ og kan kjøres
--  flere ganger uten å ødelegge data.
-- ============================================================================

-- >>> 20260810100000_rorlager_init.sql <<<

-- ============================================================================
--  RÃ˜RLAGER â€“ grunnskjema
--
--  Kunden skannar ein QR-kode pÃ¥ hylla, legg rÃ¸r og meter i ei handlekurv og
--  sender inn. Admin ser alt, styrer lageret og lagar fakturagrunnlag.
--
--  Alle tabellar er prefiksa med pipe_ slik at skjemaet kan bu i same
--  Supabase-prosjekt som dei andre appane utan Ã¥ kollidere.
-- ============================================================================

-- ---------------------------------------------------------------- hjelparar
create or replace function public.pipe_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Slug til QR-lenkene: berre a-z, 0-9 og bindestrek, sÃ¥ koden kan stÃ¥ i ein URL
create or replace function public.pipe_slugify(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      lower(
        translate(coalesce(p_text, ''),
          'Ã¦Ã¸Ã¥Ã¤Ã¶Ã¼Ã©Ã¨ÃªÃ¡Ã Ã¢Ã­Ã¬Ã®Ã³Ã²Ã´ÃºÃ¹Ã»Ã±Ã§Ã†Ã˜Ã…Ã„Ã–ÃœÃ‰ÃˆÃŠÃÃ€Ã‚ÃÃŒÃŽÃ“Ã’Ã”ÃšÃ™Ã›Ã‘Ã‡',
          'aoaaouoeeeaaaiiiooouuuncAOAAOUEEEAAAIIIOOOUUUNC')
      ),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;

-- ------------------------------------------------------------- kategoriar
create table if not exists public.pipe_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- rÃ¸rtypar
create table if not exists public.pipe_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.pipe_categories(id) on delete set null,
  name text not null,
  -- Dimensjonen er eit eige felt fordi same namn finst i mange storleikar,
  -- og lista skal kunne sorterast pÃ¥ dimensjon.
  dimension text,
  sku text unique,
  -- Kortkoden som stÃ¥r i QR-koden: /r/<qr_slug>
  qr_slug text not null unique,
  unit text not null default 'm',
  price numeric,
  cost_price numeric,
  stock numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  location text,
  color text,
  description text,
  -- Sperrar uttak i appen utan Ã¥ slette historikken
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pipe_types_category on public.pipe_types (category_id);
create index if not exists idx_pipe_types_active on public.pipe_types (active);

drop trigger if exists trg_pipe_types_updated on public.pipe_types;
create trigger trg_pipe_types_updated
  before update on public.pipe_types
  for each row execute function public.pipe_touch_updated_at();

-- ------------------------------------------------------------- bestillingar
create table if not exists public.pipe_orders (
  id uuid primary key default gen_random_uuid(),
  -- LÃ¸penummer for menneske. Hol i serien er greitt â€“ dette er ein
  -- uttaksseddel, ikkje eit rekneskapsbilag med krav om ubroten serie.
  order_number bigserial not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  company text,
  project text,
  comment text,
  -- Signaturen er dokumentasjonen pÃ¥ at rÃ¸ret faktisk blei henta
  signature text,
  status text not null default 'ny' check (status in ('ny', 'behandlet', 'levert', 'avvist')),
  total numeric not null default 0,
  handled_by uuid,
  handled_at timestamptz,
  admin_note text,
  invoice_id uuid
);

create index if not exists idx_pipe_orders_status on public.pipe_orders (status);
create index if not exists idx_pipe_orders_created on public.pipe_orders (created_at desc);
create index if not exists idx_pipe_orders_customer on public.pipe_orders (customer_name);

drop trigger if exists trg_pipe_orders_updated on public.pipe_orders;
create trigger trg_pipe_orders_updated
  before update on public.pipe_orders
  for each row execute function public.pipe_touch_updated_at();

-- ------------------------------------------------------------- ordrelinjer
-- Namn, dimensjon og pris blir kopierte inn pÃ¥ linja med vilje: endrar admin
-- prisen i morgon, skal gÃ¥rsdagens bestilling framleis vise det som gjaldt dÃ¥.
create table if not exists public.pipe_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pipe_orders(id) on delete cascade,
  pipe_type_id uuid references public.pipe_types(id) on delete set null,
  name text not null,
  dimension text,
  sku text,
  unit text not null default 'm',
  quantity numeric not null check (quantity > 0),
  unit_price numeric,
  line_total numeric,
  sort_order integer not null default 0
);

create index if not exists idx_pipe_order_lines_order on public.pipe_order_lines (order_id);
create index if not exists idx_pipe_order_lines_type on public.pipe_order_lines (pipe_type_id);

-- ------------------------------------------------------------- lagerlogg
create table if not exists public.pipe_stock_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pipe_type_id uuid references public.pipe_types(id) on delete set null,
  pipe_name text,
  -- Negativt = uttak, positivt = pÃ¥fyll
  change numeric not null,
  balance_after numeric,
  reason text not null default 'justering',
  order_id uuid,
  note text,
  created_by uuid
);

create index if not exists idx_pipe_stock_log_type on public.pipe_stock_log (pipe_type_id, created_at desc);

-- ------------------------------------------------------------- fakturagrunnlag
create table if not exists public.pipe_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  invoice_number bigserial not null unique,
  customer_name text not null,
  period_from date not null,
  period_to date not null,
  total numeric not null default 0,
  note text
);

alter table public.pipe_orders
  drop constraint if exists pipe_orders_invoice_fk;
alter table public.pipe_orders
  add constraint pipe_orders_invoice_fk
  foreign key (invoice_id) references public.pipe_invoices(id) on delete set null;

create index if not exists idx_pipe_orders_invoice on public.pipe_orders (invoice_id);

-- ------------------------------------------------------------- innstillingar
-- Ã‰i rad, alltid id = 1. Held firmainfo og brytarane som styrer kundeskjemaet.
create table if not exists public.pipe_settings (
  id integer primary key default 1 check (id = 1),
  company_name text not null default 'Hauge Maskin AS',
  org_number text,
  address text,
  phone text,
  email text,
  intro_text text,
  pickup_note text,
  show_prices boolean not null default true,
  require_phone boolean not null default true,
  require_signature boolean not null default false,
  vat_rate numeric not null default 25,
  updated_at timestamptz not null default now()
);

insert into public.pipe_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_pipe_settings_updated on public.pipe_settings;
create trigger trg_pipe_settings_updated
  before update on public.pipe_settings
  for each row execute function public.pipe_touch_updated_at();

-- ============================================================================
--  RLS
--
--  Kunden er anonym. Han skal kunne sjÃ¥ varekatalogen og sende inn ei
--  bestilling, men aldri lese andre sine bestillingar, prisar bakover i tid
--  eller lageret sin historikk. Difor gÃ¥r innsendinga gjennom ein funksjon
--  i staden for eit direkte INSERT.
-- ============================================================================
alter table public.pipe_categories  enable row level security;
alter table public.pipe_types       enable row level security;
alter table public.pipe_orders      enable row level security;
alter table public.pipe_order_lines enable row level security;
alter table public.pipe_stock_log   enable row level security;
alter table public.pipe_invoices    enable row level security;
alter table public.pipe_settings    enable row level security;

-- Katalogen er open lesing â€“ QR-koden skal virke utan innlogging
drop policy if exists "pipe_categories read" on public.pipe_categories;
create policy "pipe_categories read" on public.pipe_categories for select using (true);
drop policy if exists "pipe_categories admin" on public.pipe_categories;
create policy "pipe_categories admin" on public.pipe_categories for all to authenticated using (true) with check (true);

drop policy if exists "pipe_types read" on public.pipe_types;
create policy "pipe_types read" on public.pipe_types for select using (true);
drop policy if exists "pipe_types admin" on public.pipe_types;
create policy "pipe_types admin" on public.pipe_types for all to authenticated using (true) with check (true);

-- Innstillingane styrer kundeskjemaet, sÃ¥ dei mÃ¥ lesast anonymt
drop policy if exists "pipe_settings read" on public.pipe_settings;
create policy "pipe_settings read" on public.pipe_settings for select using (true);
drop policy if exists "pipe_settings admin" on public.pipe_settings;
create policy "pipe_settings admin" on public.pipe_settings for all to authenticated using (true) with check (true);

-- Bestillingar: berre innlogga. Kunden sin eigen kvittering kjem tilbake frÃ¥
-- funksjonen som svar, sÃ¥ han treng ikkje lesetilgang.
drop policy if exists "pipe_orders admin" on public.pipe_orders;
create policy "pipe_orders admin" on public.pipe_orders for all to authenticated using (true) with check (true);

drop policy if exists "pipe_order_lines admin" on public.pipe_order_lines;
create policy "pipe_order_lines admin" on public.pipe_order_lines for all to authenticated using (true) with check (true);

drop policy if exists "pipe_stock_log admin" on public.pipe_stock_log;
create policy "pipe_stock_log admin" on public.pipe_stock_log for all to authenticated using (true) with check (true);

drop policy if exists "pipe_invoices admin" on public.pipe_invoices;
create policy "pipe_invoices admin" on public.pipe_invoices for all to authenticated using (true) with check (true);

revoke all on public.pipe_orders      from anon;
revoke all on public.pipe_order_lines from anon;
revoke all on public.pipe_stock_log   from anon;
revoke all on public.pipe_invoices    from anon;
grant select on public.pipe_categories to anon;
grant select on public.pipe_types      to anon;
grant select on public.pipe_settings   to anon;

-- ============================================================================
--  Innsending av bestilling
--
--  Prisar og namn blir henta frÃ¥ databasen, ikkje frÃ¥ det klienten sender.
--  Ein kunde som endrar prisen i nettlesaren skal ikkje kunne endre grunnlaget.
-- ============================================================================
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
  v_lines_out jsonb := '[]'::jsonb;
  v_balance numeric;
begin
  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  if v_name is null then
    raise exception 'Navn mÃ¥ fylles ut';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Handlekurven er tom';
  end if;

  -- Tak pÃ¥ tal linjer: skjemaet kan ikkje lage sÃ¥ mange, sÃ¥ dette er ei sperre
  -- mot at nokon sender inn tusenvis av linjer rett mot funksjonen.
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'For mange varelinjer';
  end if;

  insert into public.pipe_orders (
    customer_name, customer_phone, customer_email, company, project, comment, signature
  ) values (
    v_name,
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    nullif(btrim(coalesce(p_customer_email, '')), ''),
    nullif(btrim(coalesce(p_company, '')), ''),
    nullif(btrim(coalesce(p_project, '')), ''),
    nullif(btrim(coalesce(p_comment, '')), ''),
    nullif(p_signature, '')
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := round((v_line ->> 'quantity')::numeric, 2);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Ugyldig mengde pÃ¥ en av linjene';
    end if;
    if v_qty > 100000 then
      raise exception 'Mengden er urimelig stor';
    end if;

    select * into v_type from public.pipe_types where id = (v_line ->> 'pipe_type_id')::uuid;
    if not found then
      raise exception 'Ukjent rÃ¸rtype i handlekurven';
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

    -- Uttaket blir trekt frÃ¥ med ein gong. Beholdninga fÃ¥r gÃ¥ i minus:
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

-- ============================================================================
--  Lagerjustering (admin)
--  GÃ¥r gjennom funksjon slik at loggen alltid blir skriven â€“ ein rein UPDATE
--  frÃ¥ grensesnittet ville lett glÃ¸ymt han.
-- ============================================================================
create or replace function public.pipe_adjust_stock(
  p_pipe_type_id uuid,
  p_change numeric,
  p_reason text default 'justering',
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Endringen mÃ¥ vÃ¦re forskjellig fra null';
  end if;

  update public.pipe_types
    set stock = stock + p_change
    where id = p_pipe_type_id
    returning stock, name into v_balance, v_name;

  if not found then
    raise exception 'Ukjent rÃ¸rtype';
  end if;

  insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
  values (p_pipe_type_id, v_name, p_change, v_balance, coalesce(p_reason, 'justering'), p_note, auth.uid());

  return v_balance;
end;
$$;

revoke all on function public.pipe_adjust_stock(uuid, numeric, text, text) from public, anon;
grant execute on function public.pipe_adjust_stock(uuid, numeric, text, text) to authenticated;

-- Set beholdninga til ein eksakt verdi (opptelling). Loggar differansen.
create or replace function public.pipe_set_stock(
  p_pipe_type_id uuid,
  p_stock numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric;
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;

  select stock into v_old from public.pipe_types where id = p_pipe_type_id;
  if not found then
    raise exception 'Ukjent rÃ¸rtype';
  end if;

  if v_old = p_stock then
    return v_old;
  end if;

  return public.pipe_adjust_stock(p_pipe_type_id, p_stock - v_old, 'opptelling', p_note);
end;
$$;

revoke all on function public.pipe_set_stock(uuid, numeric, text) from public, anon;
grant execute on function public.pipe_set_stock(uuid, numeric, text) to authenticated;

-- ============================================================================
--  Sletting av bestilling: rÃ¸rene skal tilbake pÃ¥ lageret
-- ============================================================================
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
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;

  select order_number into v_number from public.pipe_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

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

  delete from public.pipe_orders where id = p_order_id;
end;
$$;

revoke all on function public.pipe_delete_order(uuid) from public, anon;
grant execute on function public.pipe_delete_order(uuid) to authenticated;

-- ============================================================================
--  Fakturagrunnlag
-- ============================================================================
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
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'Ingen bestillinger valgt';
  end if;

  -- Ei bestilling skal aldri hamne pÃ¥ to grunnlag. Sjekken ligg her og ikkje
  -- berre i grensesnittet, i tilfelle to faner blir brukte samtidig.
  select count(*) into v_already
  from public.pipe_orders
  where id = any(p_order_ids) and invoice_id is not null;

  if v_already > 0 then
    raise exception '% av bestillingene er allerede fakturert', v_already;
  end if;

  insert into public.pipe_invoices (customer_name, period_from, period_to, total, note)
  values (p_customer_name, p_period_from, p_period_to, coalesce(p_total, 0), p_note)
  returning * into v_invoice;

  update public.pipe_orders
  set invoice_id = v_invoice.id,
      status = case when status = 'ny' then 'behandlet' else status end
  where id = any(p_order_ids);

  return v_invoice;
end;
$$;

revoke all on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) from public, anon;
grant execute on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) to authenticated;

-- Angre eit grunnlag: bestillingane blir ufakturerte igjen, men statusen stÃ¥r.
create or replace function public.pipe_delete_invoice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;
  update public.pipe_orders set invoice_id = null where invoice_id = p_id;
  delete from public.pipe_invoices where id = p_id;
end;
$$;

revoke all on function public.pipe_delete_invoice(uuid) from public, anon;
grant execute on function public.pipe_delete_invoice(uuid) to authenticated;

grant usage, select on sequence public.pipe_invoices_invoice_number_seq to authenticated;
grant usage, select on sequence public.pipe_orders_order_number_seq to anon, authenticated;


-- >>> 20260810100100_rorlager_admins.sql <<<

-- Superadmin og brukarregister.
--
-- Same mÃ¸nster som leveringsseddel-appen: lista over kven som fÃ¥r administrere
-- brukarar ligg i databasen, ikkje i koden, slik at tilgang kan endrast utan ny
-- utrulling. Skriven idempotent sÃ¥ han kan kÃ¸yrast i eit prosjekt der desse
-- tabellane allereie finst frÃ¥ ein annan app.

create table if not exists public.super_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;

insert into public.super_admins (email) values ('thomashauge03@gmail.com')
on conflict (email) do nothing;

-- Sjekkar innlogga e-post mot lista. SECURITY DEFINER, sÃ¥ vanlege brukarar
-- aldri fÃ¥r lese sjÃ¸lve lista over superadminar.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.super_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

drop policy if exists "Super admin can read super_admins" on public.super_admins;
create policy "Super admin can read super_admins"
  on public.super_admins for select to authenticated
  using (public.is_super_admin());

-- Register over brukarane som er lagt inn i systemet. SjÃ¸lve pÃ¥logginga ligg i
-- auth.users; denne tabellen held namn, rolle og notat som admin kan sjÃ¥.
create table if not exists public.system_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  full_name text,
  role text not null default 'admin',
  note text,
  created_by uuid default auth.uid()
);

alter table public.system_users enable row level security;

drop policy if exists "Super admin can read system_users" on public.system_users;
create policy "Super admin can read system_users"
  on public.system_users for select to authenticated
  using (public.is_super_admin());

drop policy if exists "Super admin can insert system_users" on public.system_users;
create policy "Super admin can insert system_users"
  on public.system_users for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "Super admin can update system_users" on public.system_users;
create policy "Super admin can update system_users"
  on public.system_users for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Super admin can delete system_users" on public.system_users;
create policy "Super admin can delete system_users"
  on public.system_users for delete to authenticated
  using (public.is_super_admin());


-- >>> 20260810100200_rorlager_seed.sql <<<

-- Startkatalog. Prisar og beholdningar er utgangspunkt som admin justerer i
-- appen â€“ poenget er at lageret ikkje er tomt fÃ¸rste gongen nokon skannar.
-- KÃ¸yrer trygt fleire gonger: alt er nÃ¸kla pÃ¥ sku.

insert into public.pipe_categories (name, description, color, sort_order) values
  ('PVC avlÃ¸psrÃ¸r', 'GrÃ¥ avlÃ¸ps- og spillvannsrÃ¸r', '#5b6b7a', 1),
  ('PE trykkrÃ¸r',   'Svart PE100 til vann og trykk', '#1f2933', 2),
  ('DrensrÃ¸r',      'Drenering med og uten filter',  '#6b8f3a', 3),
  ('BetongrÃ¸r',     'Betong til vei og stikkrenner', '#8a8a8a', 4),
  ('KabelrÃ¸r',      'TrekkerÃ¸r og varerÃ¸r',          '#c8462a', 5),
  ('Deler og skjÃ¸t','Bend, muffer, grenrÃ¸r og klemmer', '#a67c00', 6)
on conflict (name) do nothing;

with cat as (select id, name from public.pipe_categories)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, price, stock, low_stock_threshold, location, sort_order)
values
  ((select id from cat where name = 'PVC avlÃ¸psrÃ¸r'), 'PVC avlÃ¸psrÃ¸r SN8', '110 mm', 'PVC-110', 'pvc-110', 'm',  89,  240, 40, 'A-01', 1),
  ((select id from cat where name = 'PVC avlÃ¸psrÃ¸r'), 'PVC avlÃ¸psrÃ¸r SN8', '160 mm', 'PVC-160', 'pvc-160', 'm', 149,  180, 30, 'A-02', 2),
  ((select id from cat where name = 'PVC avlÃ¸psrÃ¸r'), 'PVC avlÃ¸psrÃ¸r SN8', '200 mm', 'PVC-200', 'pvc-200', 'm', 229,  120, 20, 'A-03', 3),
  ((select id from cat where name = 'PVC avlÃ¸psrÃ¸r'), 'PVC avlÃ¸psrÃ¸r SN8', '250 mm', 'PVC-250', 'pvc-250', 'm', 349,   60, 12, 'A-04', 4),
  ((select id from cat where name = 'PVC avlÃ¸psrÃ¸r'), 'PVC avlÃ¸psrÃ¸r SN8', '315 mm', 'PVC-315', 'pvc-315', 'm', 489,   40, 10, 'A-05', 5),

  ((select id from cat where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r', '32 mm',  'PE-32',  'pe-32',  'm',  22, 600, 100, 'B-01', 1),
  ((select id from cat where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r', '40 mm',  'PE-40',  'pe-40',  'm',  32, 450,  80, 'B-02', 2),
  ((select id from cat where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r', '50 mm',  'PE-50',  'pe-50',  'm',  46, 300,  60, 'B-03', 3),
  ((select id from cat where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r', '63 mm',  'PE-63',  'pe-63',  'm',  69, 250,  50, 'B-04', 4),
  ((select id from cat where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r', '110 mm', 'PE-110', 'pe-110', 'm', 189, 120,  25, 'B-05', 5),

  ((select id from cat where name = 'DrensrÃ¸r'), 'DrensrÃ¸r med filter',  '110 mm', 'DR-110F', 'dr-110f', 'm', 62, 300, 50, 'C-01', 1),
  ((select id from cat where name = 'DrensrÃ¸r'), 'DrensrÃ¸r uten filter', '110 mm', 'DR-110',  'dr-110',  'm', 48, 250, 50, 'C-02', 2),
  ((select id from cat where name = 'DrensrÃ¸r'), 'DrensrÃ¸r med filter',  '160 mm', 'DR-160F', 'dr-160f', 'm', 96, 120, 20, 'C-03', 3),

  ((select id from cat where name = 'BetongrÃ¸r'), 'BetongrÃ¸r stikkrenne', '300 mm', 'BET-300', 'bet-300', 'stk', 690, 24, 6, 'D-01', 1),
  ((select id from cat where name = 'BetongrÃ¸r'), 'BetongrÃ¸r stikkrenne', '400 mm', 'BET-400', 'bet-400', 'stk', 980, 16, 4, 'D-02', 2),

  ((select id from cat where name = 'KabelrÃ¸r'), 'KabelrÃ¸r SN8 rÃ¸dt', '110 mm', 'KAB-110', 'kab-110', 'm', 58, 400, 60, 'E-01', 1),
  ((select id from cat where name = 'KabelrÃ¸r'), 'TrekkerÃ¸r',         '50 mm',  'KAB-50',  'kab-50',  'm', 26, 500, 80, 'E-02', 2),

  ((select id from cat where name = 'Deler og skjÃ¸t'), 'Bend 45Â° PVC',        '110 mm',     'DEL-B45-110', 'del-b45-110', 'stk',  89, 60, 10, 'F-01', 1),
  ((select id from cat where name = 'Deler og skjÃ¸t'), 'Bend 90Â° PVC',        '110 mm',     'DEL-B90-110', 'del-b90-110', 'stk',  95, 40, 10, 'F-02', 2),
  ((select id from cat where name = 'Deler og skjÃ¸t'), 'Muffe PVC',           '110 mm',     'DEL-M-110',   'del-m-110',   'stk',  65, 80, 15, 'F-03', 3),
  ((select id from cat where name = 'Deler og skjÃ¸t'), 'GrenrÃ¸r 45Â°',         '110/110 mm', 'DEL-G-110',   'del-g-110',   'stk', 149, 30,  6, 'F-04', 4),
  ((select id from cat where name = 'Deler og skjÃ¸t'), 'Overgang PVC/PE',     '110 mm',     'DEL-O-110',   'del-o-110',   'stk', 219, 12,  4, 'F-05', 5),
  ((select id from cat where name = 'Deler og skjÃ¸t'), 'RÃ¸rklemme',           '110 mm',     'DEL-K-110',   'del-k-110',   'stk',  39, 100, 20, 'F-06', 6)
on conflict (sku) do nothing;

