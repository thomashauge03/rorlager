-- Hele skjemaet til rørlageret, i den rekkefølgen migrasjonene kjører.
--
-- GENERERT AV scripts/bygg-setup.mjs. Ikke rediger denne filen for hånd –
-- endringen ville forsvunnet ved neste generering, og verre: filen ville igjen
-- kunne si noe annet enn migrasjonene. Legg endringer i en ny migrasjon under
-- supabase/migrations/ og kjør «npm run bygg:setup».
--
-- Filen er idempotent og kan kjøres flere ganger på samme prosjekt. Det er
-- verifisert ved å kjøre alle migrasjonene to ganger mot en ekte Postgres.
--
-- Bygget fra 13 migrasjoner:
--   20260810100000_rorlager_init.sql
--   20260810100100_rorlager_admins.sql
--   20260810110000_invoice_keeps_status.sql
--   20260810120000_avanse.sql
--   20260810120100_katalog_dahl.sql
--   20260810130000_prisimport.sql
--   20260812090000_tilgangsmodell.sql
--   20260831000000_prisimport_bak_tilgangsvakt.sql
--   20260903090000_prosjekt_tilgang.sql
--   20260903090100_prosjekt_tabellar.sql
--   20260903090200_katalog_utan_innkjopspris.sql
--   20260903091000_epost_utan_store_bokstavar.sql
--   20260903092000_mottaksbilde.sql


-- ══════════════════════════════════════════════════════════════════════
-- 20260810100000_rorlager_init.sql
-- ══════════════════════════════════════════════════════════════════════

-- ============================================================================
--  RØRLAGER – grunnskjema
--
--  Kunden skannar ein QR-kode på hylla, legg rør og meter i ei handlekurv og
--  sender inn. Admin ser alt, styrer lageret og lagar fakturagrunnlag.
--
--  Alle tabellar er prefiksa med pipe_ slik at skjemaet kan bu i same
--  Supabase-prosjekt som dei andre appane utan å kollidere.
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

-- Slug til QR-lenkene: berre a-z, 0-9 og bindestrek, så koden kan stå i ein URL
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
          'æøåäöüéèêáàâíìîóòôúùûñçÆØÅÄÖÜÉÈÊÁÀÂÍÌÎÓÒÔÚÙÛÑÇ',
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

-- ------------------------------------------------------------- rørtypar
create table if not exists public.pipe_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.pipe_categories(id) on delete set null,
  name text not null,
  -- Dimensjonen er eit eige felt fordi same namn finst i mange storleikar,
  -- og lista skal kunne sorterast på dimensjon.
  dimension text,
  sku text unique,
  -- Kortkoden som står i QR-koden: /r/<qr_slug>
  qr_slug text not null unique,
  unit text not null default 'm',
  price numeric,
  cost_price numeric,
  stock numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  location text,
  color text,
  description text,
  -- Sperrar uttak i appen utan å slette historikken
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
  -- Løpenummer for menneske. Hol i serien er greitt – dette er ein
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
  -- Signaturen er dokumentasjonen på at røret faktisk blei henta
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
-- Namn, dimensjon og pris blir kopierte inn på linja med vilje: endrar admin
-- prisen i morgon, skal gårsdagens bestilling framleis vise det som gjaldt då.
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
  -- Negativt = uttak, positivt = påfyll
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
-- Éi rad, alltid id = 1. Held firmainfo og brytarane som styrer kundeskjemaet.
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
--  Kunden er anonym. Han skal kunne sjå varekatalogen og sende inn ei
--  bestilling, men aldri lese andre sine bestillingar, prisar bakover i tid
--  eller lageret sin historikk. Difor går innsendinga gjennom ein funksjon
--  i staden for eit direkte INSERT.
-- ============================================================================
alter table public.pipe_categories  enable row level security;
alter table public.pipe_types       enable row level security;
alter table public.pipe_orders      enable row level security;
alter table public.pipe_order_lines enable row level security;
alter table public.pipe_stock_log   enable row level security;
alter table public.pipe_invoices    enable row level security;
alter table public.pipe_settings    enable row level security;

-- Katalogen er open lesing – QR-koden skal virke utan innlogging
drop policy if exists "pipe_categories read" on public.pipe_categories;
create policy "pipe_categories read" on public.pipe_categories for select using (true);
drop policy if exists "pipe_categories admin" on public.pipe_categories;
create policy "pipe_categories admin" on public.pipe_categories for all to authenticated using (true) with check (true);

drop policy if exists "pipe_types read" on public.pipe_types;
create policy "pipe_types read" on public.pipe_types for select using (true);
drop policy if exists "pipe_types admin" on public.pipe_types;
create policy "pipe_types admin" on public.pipe_types for all to authenticated using (true) with check (true);

-- Innstillingane styrer kundeskjemaet, så dei må lesast anonymt
drop policy if exists "pipe_settings read" on public.pipe_settings;
create policy "pipe_settings read" on public.pipe_settings for select using (true);
drop policy if exists "pipe_settings admin" on public.pipe_settings;
create policy "pipe_settings admin" on public.pipe_settings for all to authenticated using (true) with check (true);

-- Bestillingar: berre innlogga. Kunden sin eigen kvittering kjem tilbake frå
-- funksjonen som svar, så han treng ikkje lesetilgang.
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
--  Prisar og namn blir henta frå databasen, ikkje frå det klienten sender.
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
    raise exception 'Navn må fylles ut';
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

-- ============================================================================
--  Lagerjustering (admin)
--  Går gjennom funksjon slik at loggen alltid blir skriven – ein rein UPDATE
--  frå grensesnittet ville lett gløymt han.
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
    raise exception 'Endringen må være forskjellig fra null';
  end if;

  update public.pipe_types
    set stock = stock + p_change
    where id = p_pipe_type_id
    returning stock, name into v_balance, v_name;

  if not found then
    raise exception 'Ukjent rørtype';
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
    raise exception 'Ukjent rørtype';
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
--  Sletting av bestilling: rørene skal tilbake på lageret
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

  -- Ei bestilling skal aldri hamne på to grunnlag. Sjekken ligg her og ikkje
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

-- Angre eit grunnlag: bestillingane blir ufakturerte igjen, men statusen står.
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

-- ══════════════════════════════════════════════════════════════════════
-- 20260810100100_rorlager_admins.sql
-- ══════════════════════════════════════════════════════════════════════

-- Superadmin og brukarregister.
--
-- Same mønster som leveringsseddel-appen: lista over kven som får administrere
-- brukarar ligg i databasen, ikkje i koden, slik at tilgang kan endrast utan ny
-- utrulling. Skriven idempotent så han kan køyrast i eit prosjekt der desse
-- tabellane allereie finst frå ein annan app.

create table if not exists public.super_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;

insert into public.super_admins (email) values ('thomashauge03@gmail.com')
on conflict (email) do nothing;

-- Sjekkar innlogga e-post mot lista. SECURITY DEFINER, så vanlege brukarar
-- aldri får lese sjølve lista over superadminar.
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

-- Register over brukarane som er lagt inn i systemet. Sjølve pålogginga ligg i
-- auth.users; denne tabellen held namn, rolle og notat som admin kan sjå.
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

-- ══════════════════════════════════════════════════════════════════════
-- 20260810110000_invoice_keeps_status.sql
-- ══════════════════════════════════════════════════════════════════════

-- Fakturagrunnlaget skal ikkje flytte statusen på bestillingane.
--
-- Den første utgåva sette status = 'behandlet' på alle uttak med status 'ny' når
-- eit grunnlag blei laga. Det var feil av to grunnar: å fakturere og å ekspedere
-- er to ulike ting, og angre-knappen kunne ikkje setje statusen tilbake – han
-- veit ikkje kva han var før. Resultatet var ei stille endring som ikkje lét seg
-- reversere.
--
-- No rører grunnlaget berre invoice_id, som er nettopp det angre-knappen kan
-- nullstille. Status blir styrt der han høyrer heime: i bestillingslista.

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
  if p_period_from is null or p_period_to is null then
    raise exception 'Både fra- og til-dato må fylles ut';
  end if;

  -- Ei bestilling skal aldri hamne på to grunnlag. Sjekken ligg her og ikkje
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
  set invoice_id = v_invoice.id
  where id = any(p_order_ids);

  return v_invoice;
end;
$$;

revoke all on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) from public, anon;
grant execute on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 20260810120000_avanse.sql
-- ══════════════════════════════════════════════════════════════════════

-- Avanse: påslaget frå innkjøpspris til salspris.
--
-- Prislista frå grossisten er netto innkjøpspris. Salsprisen er den same
-- rekneoperasjonen på kvar einaste vare, og skal difor styrast eitt sted i
-- staden for å tastast inn 156 gonger.
--
-- Prisen blir REKNA UT OG LAGRA, ikkje utleidd ved lesing. Det er med vilje:
-- pipe_submit_order slår opp prisen i pipe_types når ei bestilling kjem inn, og
-- ei ordrelinje skal for alltid vise prisen som gjaldt den dagen. Blei prisen
-- rekna ut på nytt ved kvar visning, ville gamle bestillingar endra seg kvar
-- gong påslaget blei justert.

alter table public.pipe_settings
  add column if not exists markup_percent numeric not null default 25;

comment on column public.pipe_settings.markup_percent is
  'Standard påslag i prosent frå cost_price til price. Brukt av pipe_apply_markup.';

-- ============================================================================
--  Rekn ut prisane på nytt
--
--  p_percent      påslag i prosent (25 = 25 % på innkjøpsprisen)
--  p_category_id  avgrens til éi varegruppe, null = alle
--  p_pipe_type_ids avgrens til utvalde varer, null = alle
--  p_round_to     rund av til nærmaste (1 = heile kroner, 0.01 = øre)
--
--  Returnerer talet på varer som fekk ny pris.
-- ============================================================================
create or replace function public.pipe_apply_markup(
  p_percent numeric,
  p_category_id uuid default null,
  p_pipe_type_ids uuid[] default null,
  p_round_to numeric default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_round numeric;
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;
  if p_percent is null or p_percent < 0 then
    raise exception 'Påslaget må være null eller høyere';
  end if;
  if p_percent > 1000 then
    raise exception 'Påslaget er urimelig høyt';
  end if;

  -- Avrunding til 0 ville gitt divisjon på null lenger nede
  v_round := coalesce(nullif(p_round_to, 0), 1);

  update public.pipe_types
  set price = round((cost_price * (1 + p_percent / 100)) / v_round) * v_round
  where cost_price is not null
    and (p_category_id is null or category_id = p_category_id)
    and (p_pipe_type_ids is null or id = any(p_pipe_type_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.pipe_apply_markup(numeric, uuid, uuid[], numeric) from public, anon;
grant execute on function public.pipe_apply_markup(numeric, uuid, uuid[], numeric) to authenticated;

-- Kor mange varer som manglar innkjøpspris, og difor ikkje blir med på
-- utrekninga. Grensesnittet må kunne seie frå om det i staden for å la dei
-- stå att med gammal pris utan forklaring.
create or replace function public.pipe_missing_cost_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.pipe_types where cost_price is null;
$$;

revoke all on function public.pipe_missing_cost_count() from public, anon;
grant execute on function public.pipe_missing_cost_count() to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 20260810120100_katalog_dahl.sql
-- ══════════════════════════════════════════════════════════════════════

-- Varekatalog frå prislista til Brødrene Dahl (tilbod 94587, revidert 10.08.26).
--
-- Prisane i lista er NETTO innkjøpspris eks. mva. Dei blir lagde inn som
-- cost_price, og salsprisen er rekna ut med påslaget under. Påslaget ligg òg i
-- pipe_settings, slik at det kan endrast eitt sted seinare – sjå prisjusteringa
-- i adminpanelet.
--
-- Demokatalogen frå oppstarten blir fjerna. Bestillingar som alt peikar på dei
-- gamle varene beheld namn og pris på linjene sine; det er berre peikaren som
-- forsvinn, og det er med vilje: historikken skal ikkje endre seg.

-- Startpåslag: 25 %
update public.pipe_settings set markup_percent = 25 where id = 1;

delete from public.pipe_types;
delete from public.pipe_categories;

insert into public.pipe_categories (name, color, sort_order) values
  ('Overvannsrør', '#2f6f9f', 1),
  ('Avløpsrør', '#5b6b7a', 2),
  ('Drensrør', '#6b8f3a', 3),
  ('PE trykkrør', '#1f2933', 4),
  ('Deler overvann', '#3f8fbf', 5),
  ('Deler avløp', '#8a7a5a', 6),
  ('PE-deler', '#4a4a4a', 7),
  ('Koblinger og kraner', '#a67c00', 8);

-- Overvannsrør (18 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '100 mm', '3100501', 'overvannsror-x-stream-sn8-100-mm', 'm', 66.7, 83.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '150 mm', '3100502', 'overvannsror-x-stream-sn8-150-mm', 'm', 120.4, 150.5, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '200 mm', '3100504', 'overvannsror-x-stream-sn8-200-mm', 'm', 195.4, 244.25, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '250 mm', '3100506', 'overvannsror-x-stream-sn8-250-mm', 'm', 297.3, 371.63, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '300 mm', '3100508', 'overvannsror-x-stream-sn8-300-mm', 'm', 405.7, 507.13, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '400 mm', '3100511', 'overvannsror-x-stream-sn8-400-mm', 'm', 707.8, 884.75, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '500 mm', '3100513', 'overvannsror-x-stream-sn8-500-mm', 'm', 1307.5, 1634.38, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '600 mm', '3100515', 'overvannsror-x-stream-sn8-600-mm', 'm', 1418.8, 1773.5, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '200/225 mm', '3012422', 'overvannsror-iq-sn8-200-225-mm', 'm', 214.3, 267.88, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '300/338 mm', '3012426', 'overvannsror-iq-sn8-300-338-mm', 'm', 396.1, 495.13, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '400/450 mm', '3012428', 'overvannsror-iq-sn8-400-450-mm', 'm', 644, 805, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '500/560 mm', '3012431', 'overvannsror-iq-sn8-500-560-mm', 'm', 1138.1, 1422.63, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '600/684 mm', '3012433', 'overvannsror-iq-sn8-600-684-mm', 'm', 1380.8, 1726, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '800/902 mm', '3012436', 'overvannsror-iq-sn8-800-902-mm', 'm', 2736.3, 3420.38, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '1000/1154 mm', '3012439', 'overvannsror-iq-sn8-1000-1154-mm', 'm', 6528, 8160, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør PVC glatt', '110 mm', '2295601', 'overvannsror-pvc-glatt-110-mm', 'm', 63.7, 79.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør PVC glatt', '160 mm', '2295603', 'overvannsror-pvc-glatt-160-mm', 'm', 148.2, 185.25, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør PVC glatt', '200 mm', '2295604', 'overvannsror-pvc-glatt-200-mm', 'm', 190.8, 238.5, 0, 0, 18);

-- Avløpsrør (3 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Avløpsrør'), 'Avløpsrør PVC', '110 mm', '2251059', 'avlopsror-pvc-110-mm', 'm', 63.7, 79.63, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Avløpsrør'), 'Avløpsrør PVC', '160 mm', '2251119', 'avlopsror-pvc-160-mm', 'm', 148.5, 185.63, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Avløpsrør'), 'Avløpsrør PVC', '200 mm', '2251159', 'avlopsror-pvc-200-mm', 'm', 190.1, 237.63, 0, 0, 3);

-- Drensrør (4 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør PE korrugert', '110 mm', '1381970', 'drensror-pe-korrugert-110-mm', 'm', 49.1, 61.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør PE korrugert', '160 mm', '1381971', 'drensror-pe-korrugert-160-mm', 'm', 124.5, 155.63, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør uten slisser', '83/100 mm', '3104919', 'drensror-uten-slisser-83-100-mm', 'm', 25.5, 31.88, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør korrugert PEH', '83/100 mm', '3104629', 'drensror-korrugert-peh-83-100-mm', 'm', 21.76, 27.2, 0, 0, 4);

-- PE trykkrør (12 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 300 m)', '20 mm', '2392757', 'pe100-sdr11-trykkror-kveil-300-m-20-mm', 'm', 13.1, 16.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '20 mm', '2392743', 'pe100-sdr11-trykkror-kveil-50-m-20-mm', 'm', 14.6, 18.25, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 300 m)', '25 mm', '2392758', 'pe100-sdr11-trykkror-kveil-300-m-25-mm', 'm', 14.2, 17.75, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '25 mm', '2392746', 'pe100-sdr11-trykkror-kveil-50-m-25-mm', 'm', 16, 20, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 300 m)', '32 mm', '2392759', 'pe100-sdr11-trykkror-kveil-300-m-32-mm', 'm', 19.4, 24.25, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '32 mm', '2392749', 'pe100-sdr11-trykkror-kveil-50-m-32-mm', 'm', 23, 28.75, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 150 m)', '40 mm', '2392761', 'pe100-sdr11-trykkror-kveil-150-m-40-mm', 'm', 36.5, 45.63, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '40 mm', '2392752', 'pe100-sdr11-trykkror-kveil-50-m-40-mm', 'm', 36.3, 45.38, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 150 m)', '50 mm', '2392762', 'pe100-sdr11-trykkror-kveil-150-m-50-mm', 'm', 54.9, 68.63, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '50 mm', '2392753', 'pe100-sdr11-trykkror-kveil-50-m-50-mm', 'm', 57.4, 71.75, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 150 m)', '63 mm', '2392764', 'pe100-sdr11-trykkror-kveil-150-m-63-mm', 'm', 80.6, 100.75, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '63 mm', '2392763', 'pe100-sdr11-trykkror-kveil-50-m-63-mm', 'm', 122.5, 153.13, 0, 0, 12);

-- Deler overvann (20 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '150 mm', '3100544', 'bend-x-stream-15gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '150 mm', '3100545', 'bend-x-stream-30gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '150 mm', '3100546', 'bend-x-stream-45gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '150 mm', '3100547', 'bend-x-stream-90gr-150-mm', 'stk', 327, 408.75, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '150 mm', '3100652', 'dobbeltmuffe-x-stream-150-mm', 'stk', 153.7, 192.13, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '200 mm', '3100548', 'bend-x-stream-15gr-200-mm', 'stk', 370, 462.5, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '200 mm', '3100549', 'bend-x-stream-30gr-200-mm', 'stk', 368.8, 461, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '200 mm', '3100551', 'bend-x-stream-45gr-200-mm', 'stk', 368.8, 461, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '200 mm', '3100552', 'bend-x-stream-90gr-200-mm', 'stk', 570, 712.5, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '200 mm', '3100653', 'dobbeltmuffe-x-stream-200-mm', 'stk', 216.3, 270.38, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '250 mm', '3100553', 'bend-x-stream-15gr-250-mm', 'stk', 1202.4, 1503, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '250 mm', '3100554', 'bend-x-stream-30gr-250-mm', 'stk', 1202.4, 1503, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '250 mm', '3100555', 'bend-x-stream-45gr-250-mm', 'stk', 1205.1, 1506.38, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '250 mm', '3100556', 'bend-x-stream-90gr-250-mm', 'stk', 1701, 2126.25, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '250 mm', '3100654', 'dobbeltmuffe-x-stream-250-mm', 'stk', 454.5, 568.13, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '300 mm', '3100557', 'bend-x-stream-15gr-300-mm', 'stk', 1863.5, 2329.38, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '300 mm', '3100558', 'bend-x-stream-30gr-300-mm', 'stk', 1863.5, 2329.38, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '300 mm', '3100559', 'bend-x-stream-45gr-300-mm', 'stk', 1865, 2331.25, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '300 mm', '3100561', 'bend-x-stream-90gr-300-mm', 'stk', 2613, 3266.25, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '300 mm', '3100655', 'dobbeltmuffe-x-stream-300-mm', 'stk', 510.4, 638, 0, 0, 20);

-- Deler avløp (36 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 15°', '110 mm', '2252254', 'bend-grunnavlop-15gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 30°', '110 mm', '2252264', 'bend-grunnavlop-30gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 45°', '110 mm', '2252269', 'bend-grunnavlop-45gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 90°', '110 mm', '2252279', 'bend-grunnavlop-90gr-110-mm', 'stk', 39, 48.75, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 15°', '160 mm', '2252374', 'bend-grunnavlop-15gr-160-mm', 'stk', 108.4, 135.5, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 30°', '160 mm', '2252384', 'bend-grunnavlop-30gr-160-mm', 'stk', 121.9, 152.38, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 45°', '160 mm', '2252389', 'bend-grunnavlop-45gr-160-mm', 'stk', 121.9, 152.38, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 90°', '160 mm', '2252394', 'bend-grunnavlop-90gr-160-mm', 'stk', 205.5, 256.88, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 15°', '200 mm', '2252409', 'bend-grunnavlop-15gr-200-mm', 'stk', 251.7, 314.63, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 30°', '200 mm', '2252419', 'bend-grunnavlop-30gr-200-mm', 'stk', 260.3, 325.38, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 45°', '200 mm', '2252424', 'bend-grunnavlop-45gr-200-mm', 'stk', 260.5, 325.63, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 90°', '200 mm', '2252434', 'bend-grunnavlop-90gr-200-mm', 'stk', 472.5, 590.63, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '110 mm', '2253014', 'grenror-grunnavlop-110-mm', 'stk', 65.4, 81.75, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '160X110 mm', '2253044', 'grenror-grunnavlop-160x110-mm', 'stk', 118.4, 148, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '160 mm', '2253054', 'grenror-grunnavlop-160-mm', 'stk', 175.4, 219.25, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp 45°', '200X110 mm', '2253084', 'grenror-grunnavlop-45gr-200x110-mm', 'stk', 327.7, 409.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '200X160 mm', '2253094', 'grenror-grunnavlop-200x160-mm', 'stk', 309.9, 387.38, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Løpemuffe grunnavløp', '110 mm', '2255209', 'lopemuffe-grunnavlop-110-mm', 'stk', 36.1, 45.13, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Løpemuffe grunnavløp', '160 mm', '2255224', 'lopemuffe-grunnavlop-160-mm', 'stk', 85.9, 107.38, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Løpemuffe grunnavløp', '200 mm', '2255234', 'lopemuffe-grunnavlop-200-mm', 'stk', 172.2, 215.25, 0, 0, 20),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Dobbelmuffe grunnavløp', '110 mm', '2255009', 'dobbelmuffe-grunnavlop-110-mm', 'stk', 36.3, 45.38, 0, 0, 21),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Dobbelmuffe grunnavløp', '160 mm', '2255024', 'dobbelmuffe-grunnavlop-160-mm', 'stk', 85.9, 107.38, 0, 0, 22),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Dobbelmuffe grunnavløp', '200 mm', '2255034', 'dobbelmuffe-grunnavlop-200-mm', 'stk', 172.2, 215.25, 0, 0, 23),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Ters grunnavløp', '110 mm', '2254709', 'ters-grunnavlop-110-mm', 'stk', 37.6, 47, 0, 0, 24),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Ters grunnavløp', '160 mm', '2254724', 'ters-grunnavlop-160-mm', 'stk', 62.9, 78.63, 0, 0, 25),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Ters grunnavløp', '200 mm', '2254734', 'ters-grunnavlop-200-mm', 'stk', 101.8, 127.25, 0, 0, 26),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 11°', '160 mm', '2251669', 'bend-langt-avlop-11gr-160-mm', 'stk', 691, 863.75, 0, 0, 27),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 22°', '160 mm', '2251679', 'bend-langt-avlop-22gr-160-mm', 'stk', 691, 863.75, 0, 0, 28),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 30°', '160 mm', '2251684', 'bend-langt-avlop-30gr-160-mm', 'stk', 691, 863.75, 0, 0, 29),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 45°', '160 mm', '2251689', 'bend-langt-avlop-45gr-160-mm', 'stk', 691, 863.75, 0, 0, 30),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 11°', '200 mm', '2251749', 'bend-langt-avlop-11gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 31),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 22°', '200 mm', '2251759', 'bend-langt-avlop-22gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 32),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 30°', '200 mm', '2251764', 'bend-langt-avlop-30gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 33),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 45°', '200 mm', '2251769', 'bend-langt-avlop-45gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 34),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Stake- og spylegren PP', '110/200 mm', '3210046', 'stake-og-spylegren-pp-110-200-mm', 'stk', 546.5, 683.13, 0, 0, 35),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Stake- og spylegren PP', '160/200 mm', '3210047', 'stake-og-spylegren-pp-160-200-mm', 'stk', 746.8, 933.5, 0, 0, 36);

-- PE-deler (44 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '32 mm', '2265541', 'elektromuffe-pe100-32-mm', 'stk', 46.58, 58.22, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '40 mm', '2265542', 'elektromuffe-pe100-40-mm', 'stk', 46.58, 58.22, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '50 mm', '2265543', 'elektromuffe-pe100-50-mm', 'stk', 67.66, 84.57, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '63 mm', '2265544', 'elektromuffe-pe100-63-mm', 'stk', 70.38, 87.98, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '75 mm', '2265545', 'elektromuffe-pe100-75-mm', 'stk', 100.64, 125.8, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '90 mm', '2265546', 'elektromuffe-pe100-90-mm', 'stk', 140.42, 175.52, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '110 mm', '2265547', 'elektromuffe-pe100-110-mm', 'stk', 166.94, 208.68, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '125 mm', '2265548', 'elektromuffe-pe100-125-mm', 'stk', 253.3, 316.63, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '140 mm', '2265549', 'elektromuffe-pe100-140-mm', 'stk', 270.3, 337.88, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '160 mm', '2265551', 'elektromuffe-pe100-160-mm', 'stk', 302.6, 378.25, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '180 mm', '2265552', 'elektromuffe-pe100-180-mm', 'stk', 487.9, 609.88, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '250 mm', '2265555', 'elektromuffe-pe100-250-mm', 'stk', 1040.4, 1300.5, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '280 mm', '2265556', 'elektromuffe-pe100-280-mm', 'stk', 1264.8, 1581, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '315 mm', '2265557', 'elektromuffe-pe100-315-mm', 'stk', 1509.6, 1887, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '200 mm', '2265553', 'elektromuffe-pe100-200-mm', 'stk', 537.2, 671.5, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektromuffe PE100', '225 mm', '2265554', 'elektromuffe-pe100-225-mm', 'stk', 601.8, 752.25, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '32 mm', '2265571', 'elektroalbue-pe100-90gr-32-mm', 'stk', 88.74, 110.93, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '40 mm', '2265572', 'elektroalbue-pe100-90gr-40-mm', 'stk', 108.8, 136, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '50 mm', '2265573', 'elektroalbue-pe100-90gr-50-mm', 'stk', 140.76, 175.95, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '63 mm', '2265574', 'elektroalbue-pe100-90gr-63-mm', 'stk', 158.44, 198.05, 0, 0, 20),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '75 mm', '2265575', 'elektroalbue-pe100-90gr-75-mm', 'stk', 251.6, 314.5, 0, 0, 21),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '90 mm', '2265576', 'elektroalbue-pe100-90gr-90-mm', 'stk', 287.3, 359.13, 0, 0, 22),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '110 mm', '2265577', 'elektroalbue-pe100-90gr-110-mm', 'stk', 404.6, 505.75, 0, 0, 23),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '125 mm', '2265578', 'elektroalbue-pe100-90gr-125-mm', 'stk', 579.7, 724.63, 0, 0, 24),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '160 mm', '2265579', 'elektroalbue-pe100-90gr-160-mm', 'stk', 965.6, 1207, 0, 0, 25),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '32 mm', '2265581', 'elektroalbue-pe100-45gr-32-mm', 'stk', 89.76, 112.2, 0, 0, 26),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '40 mm', '2265582', 'elektroalbue-pe100-45gr-40-mm', 'stk', 107.78, 134.73, 0, 0, 27),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '50 mm', '2265583', 'elektroalbue-pe100-45gr-50-mm', 'stk', 141.78, 177.23, 0, 0, 28),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '63 mm', '2265584', 'elektroalbue-pe100-45gr-63-mm', 'stk', 158.78, 198.48, 0, 0, 29),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '75 mm', '2265585', 'elektroalbue-pe100-45gr-75-mm', 'stk', 273.7, 342.13, 0, 0, 30),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '90 mm', '2265586', 'elektroalbue-pe100-45gr-90-mm', 'stk', 287.3, 359.13, 0, 0, 31),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '110 mm', '2265587', 'elektroalbue-pe100-45gr-110-mm', 'stk', 406.3, 507.88, 0, 0, 32),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '125 mm', '2265588', 'elektroalbue-pe100-45gr-125-mm', 'stk', 578, 722.5, 0, 0, 33),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '160 mm', '2265589', 'elektroalbue-pe100-45gr-160-mm', 'stk', 965.6, 1207, 0, 0, 34),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '32 mm', '2462163', 't-ror-elektro-pe100-90gr-32-mm', 'stk', 117.64, 147.05, 0, 0, 35),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '40 mm', '2462165', 't-ror-elektro-pe100-90gr-40-mm', 'stk', 135.66, 169.58, 0, 0, 36),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '50 mm', '2462167', 't-ror-elektro-pe100-90gr-50-mm', 'stk', 173.4, 216.75, 0, 0, 37),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '63 mm', '2462169', 't-ror-elektro-pe100-90gr-63-mm', 'stk', 197.2, 246.5, 0, 0, 38),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Reduksjon elektro PE100', '40-32 mm', '2462209', 'reduksjon-elektro-pe100-40-32-mm', 'stk', 99.28, 124.1, 0, 0, 39),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Reduksjon elektro PE100', '50-32 mm', '2462213', 'reduksjon-elektro-pe100-50-32-mm', 'stk', 124.44, 155.55, 0, 0, 40),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Reduksjon elektro PE100', '50-40 mm', '2462216', 'reduksjon-elektro-pe100-50-40-mm', 'stk', 137.36, 171.7, 0, 0, 41),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Reduksjon elektro PE100', '63-32 mm', '2462219', 'reduksjon-elektro-pe100-63-32-mm', 'stk', 148.24, 185.3, 0, 0, 42),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Reduksjon elektro PE100', '63-40 mm', '2462223', 'reduksjon-elektro-pe100-63-40-mm', 'stk', 148.24, 185.3, 0, 0, 43),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Reduksjon elektro PE100', '63-50 mm', '2462226', 'reduksjon-elektro-pe100-63-50-mm', 'stk', 148.24, 185.3, 0, 0, 44);

-- Koblinger og kraner (19 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Union Isiflo', '32 mm', '2561034', 'union-isiflo-32-mm', 'stk', 261.4, 326.75, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Union Isiflo', '40 mm', '2561039', 'union-isiflo-40-mm', 'stk', 426.2, 532.75, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Union Isiflo', '50 mm', '2561044', 'union-isiflo-50-mm', 'stk', 659, 823.75, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Union Isiflo', '25 mm', '2561029', 'union-isiflo-25-mm', 'stk', 203.7, 254.63, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Union Isiflo', '63 mm', '2561162', 'union-isiflo-63-mm', 'stk', 1011.8, 1264.75, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 3/4"', '25 mm', '2561429', 'tippunion-isiflo-3-4-25-mm', 'stk', 153.8, 192.25, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 1"', '32 mm', '2561434', 'tippunion-isiflo-1-32-mm', 'stk', 170.1, 212.63, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 1.1/4"', '40 mm', '2561439', 'tippunion-isiflo-1-1-4-40-mm', 'stk', 306.7, 383.38, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 1.1/2"', '50 mm', '2561444', 'tippunion-isiflo-1-1-2-50-mm', 'stk', 486.8, 608.5, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 2"', '63 mm', '2561164', 'tippunion-isiflo-2-63-mm', 'stk', 773, 966.25, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '25 mm', '2564029', 'stottehylse-isiflo-25-mm', 'stk', 37.1, 46.38, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '32 mm', '2564034', 'stottehylse-isiflo-32-mm', 'stk', 42.2, 52.75, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '40 mm', '2564039', 'stottehylse-isiflo-40-mm', 'stk', 82.6, 103.25, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '50 mm', '2564044', 'stottehylse-isiflo-50-mm', 'stk', 105, 131.25, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '63 mm', '2564054', 'stottehylse-isiflo-63-mm', 'stk', 147.35, 184.19, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Bakkekran Isiflo m/mutter', '32 mm', '3383606', 'bakkekran-isiflo-m-mutter-32-mm', 'stk', 990.1, 1237.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Bakkekran Isiflo m/mutter', '40 mm', '3383608', 'bakkekran-isiflo-m-mutter-40-mm', 'stk', 1899.6, 2374.5, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Spindelforlenger XO 97-165 cm', null, '3351033', 'spindelforlenger-xo-97-165-cm', 'stk', 539, 673.75, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Spindelforlenger XO 147-266 cm', null, '3351032', 'spindelforlenger-xo-147-266-cm', 'stk', 621.25, 776.56, 0, 0, 19);

-- ══════════════════════════════════════════════════════════════════════
-- 20260810130000_prisimport.sql
-- ══════════════════════════════════════════════════════════════════════

-- Import av prisliste frå grossist.
--
-- Nøkkelen er varenummeret (sku). Namn, dimensjon, hylleplass og beholdning blir
-- IKKJE rørte: admin kan ha retta dei for hand, og ei prisoppdatering skal ikkje
-- skrive over det arbeidet. Det einaste som blir endra er innkjøpsprisen og
-- salsprisen som følgjer av han.
--
-- Alt skjer i éin operasjon. 156 enkeltoppdateringar frå nettlesaren ville teke
-- lang tid og kunne stoppa halvvegs, og då hadde halve katalogen hatt nye prisar
-- og halve gamle – utan at nokon visste kvar grensa gjekk.

create or replace function public.pipe_import_costs(
  p_rows jsonb,
  p_percent numeric,
  p_round_to numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round numeric;
  v_updated integer;
  v_unmatched text[];
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Ingen varelinjer å importere';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'For mange varelinjer i én import';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 1000 then
    raise exception 'Ugyldig påslag';
  end if;

  v_round := coalesce(nullif(p_round_to, 0), 1);

  create temporary table if not exists _pipe_import (sku text primary key, cost numeric) on commit drop;
  delete from _pipe_import;

  insert into _pipe_import (sku, cost)
  select btrim(r ->> 'sku'), (r ->> 'cost')::numeric
  from jsonb_array_elements(p_rows) r
  where btrim(coalesce(r ->> 'sku', '')) <> ''
    and (r ->> 'cost')::numeric > 0
  on conflict (sku) do nothing;

  update public.pipe_types t
  set cost_price = i.cost,
      price = round((i.cost * (1 + p_percent / 100)) / v_round) * v_round
  from _pipe_import i
  where btrim(t.sku) = i.sku;

  get diagnostics v_updated = row_count;

  -- Varenummer i fila som ikkje finst i katalogen. Grensesnittet tilbyr å
  -- opprette dei, men det skal vere eit eige, medvite val.
  select coalesce(array_agg(i.sku), '{}')
  into v_unmatched
  from _pipe_import i
  where not exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku);

  return jsonb_build_object(
    'updated', v_updated,
    'received', (select count(*) from _pipe_import),
    'unmatched', to_jsonb(v_unmatched)
  );
end;
$$;

revoke all on function public.pipe_import_costs(jsonb, numeric, numeric) from public, anon;
grant execute on function public.pipe_import_costs(jsonb, numeric, numeric) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 20260812090000_tilgangsmodell.sql
-- ══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- Tilgang krever nå en rad i system_users.
--
-- Før dette var HVER policy på HVER pipe_*-tabell
-- `to authenticated using (true) with check (true)`. Alle med en innlogging
-- hadde alt: lager, priser, ordrer, fakturaer og innstillinger. Og
-- selvregistrering er på i prosjektet, så den som kunne ta imot e-post kunne
-- registrere seg og få det.
--
-- Verre: de seks SECURITY DEFINER-funksjonene omgår RLS helt. De sjekket bare
-- `auth.uid() is null`, altså «er du logget inn», og en fremmed kunne dermed
-- justere lager, endre alle priser med påslag, opprette og slette fakturaer og
-- slette ordrer gjennom RPC – uansett hva policyene sa.
--
-- system_users fantes allerede, med (email, full_name, role, note), men den var
-- TOM og ble ikke lest av noen policy, funksjon eller trigger. Den var et
-- passivt register: adminbordet skrev rader dit i den tro at det ga tilgang, og
-- slettet rader i den tro at det fjernet tilgang. Ingen av delene skjedde.
--
-- Notatet i adminbordets register sa «Rollen ligger i admin_brukere». Den
-- tabellen finnes ikke i rørlageret i det hele tatt.
--
-- REKKEFØLGEN I DENNE FILA ER IKKE VILKÅRLIG. Brukeren legges inn FØR noe
-- strammes. Motsatt rekkefølge låser ut den som er innlogget nå, inkludert den
-- som skal rette det.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Dagens bruker inn, før noe strammes ──
--
-- Målt i auth.users 2026-08-12: én bekreftet konto, sist innlogget 10. august.
-- Den står også i super_admins og ville sluppet inn uansett, men raden legges
-- inn likevel: den gjør tilgangen synlig i adminbordet, og super_admins er
-- retten til å bestemme hvem ANDRE som slipper inn – ikke det samme som å være
-- bruker.

insert into public.system_users (email, full_name, role, note)
values
  ('thomashauge03@gmail.com', 'Thomas Hauge', 'admin',
   'Lagt inn da rollemodellen ble slått på. Står også i super_admins.')
on conflict (email) do nothing;


-- ── 2. Funksjonen policyene spør ──
--
-- SECURITY DEFINER fordi den leser system_users, som bare en super admin har
-- leserett til. Uten definer ville hver policy kalt en funksjon som selv blir
-- stoppet av en policy – en rekursjon Postgres avviser.
--
-- Nøkkelen er E-POSTEN fra JWT-en, ikke auth.uid(). Det er en bevisst
-- videreføring av mønsteret i is_super_admin(): en rad kan legges inn FØR
-- personen har registrert seg, og virker fra første innlogging. Med auth-id som
-- nøkkel måtte kontoen finnes først.

create or replace function public.hm_har_tilgang()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.system_users
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) or public.is_super_admin();
$$;

comment on function public.hm_har_tilgang() is
  'Har den innloggede tilgang til admindelen? Rad i system_users, eller super admin. Brukes av hver policy og hver SECURITY DEFINER-funksjon.';

-- anon har ingenting å gjøre her: kundeflyten går på egne policyer og på
-- pipe_submit_order, som med vilje står uten vakt.
revoke all on function public.hm_har_tilgang() from public;
grant execute on function public.hm_har_tilgang() to authenticated;


/*
 * Rollen, til visning og til framtidig avgrensning per tabell.
 *
 * MERK: rollen avgrenser ingenting ennå. 'admin', 'kontor' og 'lager' har i dag
 * samme tilgang, og det er sant framfor å late som noe annet. Å skille dem
 * krever en beslutning om hva en lagerarbeider IKKE skal se, og den er ikke
 * tatt.
 */
create or replace function public.hm_rolle()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin() then 'super_admin'
    else (
      select role from public.system_users
       where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       limit 1
    )
  end;
$$;

comment on function public.hm_rolle() is
  'Rollen til den innloggede: super_admin, eller role fra system_users. Null uten tilgang. Avgrenser ingenting ennå.';

revoke all on function public.hm_rolle() from public;
grant execute on function public.hm_rolle() to authenticated;


-- ── 2b. Den ene funksjonen som ikke er plpgsql ──
--
-- pipe_missing_cost_count er en sql-funksjon, så det går ikke å legge inn en
-- `raise` i den. Vakta blir en case i stedet: uten tilgang gir den null, ikke
-- et tall. Lekkasjen var liten – hvor mange rørtyper som mangler innkjøpspris –
-- men den var der, og den var gratis å lukke.

create or replace function public.pipe_missing_cost_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.hm_har_tilgang()
      then (select count(*)::integer from public.pipe_types where cost_price is null)
    else null
  end;
$$;


-- ═══════════════════════════════════════════════════════════
-- 3. SECURITY DEFINER-funksjonene
--
-- Disse omgår RLS. Uten vakt her ville policyene under vært uten virkning:
-- en fremmed som registrerer seg kunne justere lager, endre alle priser,
-- opprette og slette fakturaer og slette ordrer gjennom RPC uten å røre en
-- tabell direkte.
--
-- Kroppene er hentet ordrett fra basen og bare fått vakta byttet eller lagt
-- inn. Ingen logikk er endret.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pipe_adjust_stock(p_pipe_type_id uuid, p_change numeric, p_reason text DEFAULT 'justering'::text, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance numeric;
  v_name text;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Endringen må være forskjellig fra null';
  end if;

  update public.pipe_types
    set stock = stock + p_change
    where id = p_pipe_type_id
    returning stock, name into v_balance, v_name;

  if not found then
    raise exception 'Ukjent rørtype';
  end if;

  insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note, created_by)
  values (p_pipe_type_id, v_name, p_change, v_balance, coalesce(p_reason, 'justering'), p_note, auth.uid());

  return v_balance;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_apply_markup(p_percent numeric, p_category_id uuid DEFAULT NULL::uuid, p_pipe_type_ids uuid[] DEFAULT NULL::uuid[], p_round_to numeric DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_round numeric;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_percent is null or p_percent < 0 then
    raise exception 'Påslaget må være null eller høyere';
  end if;
  if p_percent > 1000 then
    raise exception 'Påslaget er urimelig høyt';
  end if;

  -- Avrunding til 0 ville gitt divisjon på null lenger nede
  v_round := coalesce(nullif(p_round_to, 0), 1);

  update public.pipe_types
  set price = round((cost_price * (1 + p_percent / 100)) / v_round) * v_round
  where cost_price is not null
    and (p_category_id is null or category_id = p_category_id)
    and (p_pipe_type_ids is null or id = any(p_pipe_type_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_create_invoice(p_customer_name text, p_period_from date, p_period_to date, p_order_ids uuid[], p_total numeric, p_note text DEFAULT NULL::text)
 RETURNS pipe_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invoice public.pipe_invoices;
  v_already int;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'Ingen bestillinger valgt';
  end if;
  if p_period_from is null or p_period_to is null then
    raise exception 'Både fra- og til-dato må fylles ut';
  end if;

  -- Ei bestilling skal aldri hamne på to grunnlag. Sjekken ligg her og ikkje
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
  set invoice_id = v_invoice.id
  where id = any(p_order_ids);

  return v_invoice;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_delete_invoice(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  update public.pipe_orders set invoice_id = null where invoice_id = p_id;
  delete from public.pipe_invoices where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_delete_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record;
  v_balance numeric;
  v_number bigint;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
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
$function$
;

CREATE OR REPLACE FUNCTION public.pipe_set_stock(p_pipe_type_id uuid, p_stock numeric, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old numeric;
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select stock into v_old from public.pipe_types where id = p_pipe_type_id;
  if not found then
    raise exception 'Ukjent rørtype';
  end if;

  if v_old = p_stock then
    return v_old;
  end if;

  return public.pipe_adjust_stock(p_pipe_type_id, p_stock - v_old, 'opptelling', p_note);
end;
$function$
;

-- ═══════════════════════════════════════════════════════════
-- 4. Policyene
--
-- ALTER framfor DROP + CREATE: ingen glippe der tabellen står uten policy.
-- Bare klausulene som finnes endres – en INSERT-policy har bare with check.
-- Lista er generert fra pg_policies, ikke skrevet fra hukommelsen.
--
-- De offentlige policyene står URØRT. En anonym forespørsel kan bare bruke
-- {public}-policyer, så å stramme authenticated-policyene kan ikke røre
-- kundeflyten.
-- ═══════════════════════════════════════════════════════════

alter policy "pipe_categories admin" on public.pipe_categories
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_invoices admin" on public.pipe_invoices
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_order_lines admin" on public.pipe_order_lines
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_orders admin" on public.pipe_orders
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_settings admin" on public.pipe_settings
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_stock_log admin" on public.pipe_stock_log
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

alter policy "pipe_types admin" on public.pipe_types
  using (public.hm_har_tilgang())
  with check (public.hm_har_tilgang());

-- ══════════════════════════════════════════════════════════════════════
-- 20260831000000_prisimport_bak_tilgangsvakt.sql
-- ══════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- pipe_import_costs: manglande tilgangsvakt
-- ---------------------------------------------------------------------------
--
-- 20260812090000_tilgangsmodell.sql stramma inn heile systemet: kvar RLS-policy
-- og kvar SECURITY DEFINER-funksjon fekk hm_har_tilgang() som vakt, fordi
-- sjølvregistrering er på og «authenticated» difor tyder «kven som helst på
-- internett». Migrasjonen tok dei seks funksjonane den visste om, pluss
-- pipe_missing_cost_count.
--
-- pipe_import_costs vart oppretta i 20260810130000_prisimport.sql og gjekk
-- under radaren. Ho står framleis med berre
--
--     if auth.uid() is null then raise exception 'Krever innlogging'; end if;
--
-- Funksjonen er SECURITY DEFINER og skriv cost_price og price på pipe_types,
-- altså går ho utanom RLS. Ein framand som registrerer seg får ein JWT, men
-- ingen rad i system_users — alt anna stoppar han. Denne eine gjorde det ikkje:
-- han kunne lese sku fritt frå den offentlege katalogen, kalle
--
--     rpc('pipe_import_costs', { p_rows: [{sku:'…', cost:0.01}], p_percent:0 })
--
-- og skrive om heile prislista. Kombinert med open ordreinnsending: sett prisen
-- til null, bestill billig.
--
-- Funksjonskroppen er uendra frå originalen. Einaste skilnaden er vakta.

create or replace function public.pipe_import_costs(
  p_rows jsonb,
  p_percent numeric,
  p_round_to numeric default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round numeric;
  v_updated integer;
  v_unmatched text[];
begin
  -- Same vakt som dei andre skrivefunksjonane. auth.uid() aleine er ikkje nok:
  -- innlogga og autorisert er to ulike ting når kven som helst kan registrere seg.
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Ingen varelinjer å importere';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'For mange varelinjer i én import';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 1000 then
    raise exception 'Ugyldig påslag';
  end if;

  v_round := coalesce(nullif(p_round_to, 0), 1);

  create temporary table if not exists _pipe_import (sku text primary key, cost numeric) on commit drop;
  delete from _pipe_import;

  insert into _pipe_import (sku, cost)
  select btrim(r ->> 'sku'), (r ->> 'cost')::numeric
  from jsonb_array_elements(p_rows) r
  where btrim(coalesce(r ->> 'sku', '')) <> ''
    and (r ->> 'cost')::numeric > 0
  on conflict (sku) do nothing;

  update public.pipe_types t
  set cost_price = i.cost,
      price = round((i.cost * (1 + p_percent / 100)) / v_round) * v_round
  from _pipe_import i
  where btrim(t.sku) = i.sku;

  get diagnostics v_updated = row_count;

  -- Varenummer i fila som ikkje finst i katalogen. Grensesnittet tilbyr å
  -- opprette dei, men det skal vere eit eige, medvite val.
  select coalesce(array_agg(i.sku), '{}')
  into v_unmatched
  from _pipe_import i
  where not exists (select 1 from public.pipe_types t where btrim(t.sku) = i.sku);

  return jsonb_build_object(
    'updated', v_updated,
    'received', (select count(*) from _pipe_import),
    'unmatched', to_jsonb(v_unmatched)
  );
end;
$$;

revoke all on function public.pipe_import_costs(jsonb, numeric, numeric) from public, anon;
grant execute on function public.pipe_import_costs(jsonb, numeric, numeric) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 20260903090000_prosjekt_tilgang.sql
-- ══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- Rollene begynner å bety noe.
--
-- Fram til nå har én rad i system_users gitt alt. hm_har_tilgang() er sann for
-- enhver rad, og hm_rolle() står med kommentaren «Avgrenser ingenting ennå».
-- Det holdt så lenge alle med innlogging satt på kontoret.
--
-- Nå skal folk på byggeplassen logge inn for å melde behov og kvittere for
-- mottak. Uten et skille ville de samtidig fått fakturagrunnlaget,
-- innkjøpsprisene, lagerstyringen og prisjusteringen.
--
--
-- HVORFOR hm_har_tilgang() BLIR STÅENDE SOM ET ALIAS
--
-- Vakta kalles femten steder: sju policyer og åtte SECURITY DEFINER-funksjoner.
-- Å bytte den hvert sted ville betydd å skrive åtte funksjonskropper om igjen,
-- og forrige tilgangsmigrasjon advarte mot nettopp dette: «Lista er generert fra
-- pg_policies, ikke skrevet fra hukommelsen.» En kropp tastet feil fra minnet er
-- en stille regresjon i en SECURITY DEFINER-funksjon.
--
-- Så logikken legges i hm_er_kontor(), og hm_har_tilgang() blir en tynn
-- videresending. Alle femten kallstedene får den nye betydningen uten at en
-- eneste kropp røres.
--
-- Navnet lyver ikke: kommentaren har hele tiden sagt «tilgang til admindelen»,
-- og en prosjektbruker har ikke det. Det er den samme påstanden som før — det er
-- verden som har fått en ny slags bruker.
--
--
-- HVORFOR VILKÅRET ER NEGATIVT
--
-- hm_er_kontor() spør om rollen er FORSKJELLIG FRA 'prosjekt', ikke om den er
-- lik 'admin'. Dermed beholder dagens rad (role = 'admin') tilgangen av seg
-- selv, og det samme gjør 'kontor' og 'lager' som tilgangsmigrasjonen nevner.
-- Ingen datamigrasjon, ingen rekkefølge som kan låse ut den som er innlogget
-- mens fila kjører. Bare den som eksplisitt er satt til 'prosjekt' mister noe,
-- og i dag finnes det ingen slike rader.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Vakta for admindelen ──

create or replace function public.hm_er_kontor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.system_users
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       -- lower og btrim fordi system_users.role ikke har noen skranke.
       -- Uten dette ville 'Prosjekt', 'PROSJEKT' og 'prosjekt ' alle regnet
       -- som kontor – ett feilklikk eller én import unna full tilgang.
       and btrim(lower(coalesce(role, ''))) <> 'prosjekt'
  );
$$;

comment on function public.hm_er_kontor() is
  'Hører den innloggede til kontoret? Super admin, eller rad i system_users med rolle forskjellig fra prosjekt. Dette er vakta bak lager, priser, ordrer, fakturaer og innstillinger.';

-- BÅDE public OG anon.
--
-- `revoke ... from public` åleine held ikkje. Supabase har
-- `alter default privileges in schema public grant all on functions to anon`,
-- så anon får ein EKSPLISITT grant i det funksjonen blir oppretta, og den
-- overlever at den implisitte PUBLIC-granten blir trekt tilbake.
--
-- Målt på ein base bygd frå desse migrasjonane sto det
-- `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}` att på både
-- hm_rolle og hm_har_tilgang etter revoke-en frå 20260812090000.
--
-- Det lak ingenting – utan e-post i JWT-en svarar dei null og usant uansett –
-- men migrasjonen påsto at anon var stengd ute, og det var han ikkje.
revoke all on function public.hm_er_kontor() from public, anon;
grant execute on function public.hm_er_kontor() to authenticated;


-- ── 2. Det gamle navnet peker på det nye ──
--
-- Kroppen byttes, signaturen ikke. De sju policyene og de åtte SECURITY
-- DEFINER-funksjonene som kaller denne, endrer betydning i samme øyeblikk uten
-- at noen av dem er rørt.

create or replace function public.hm_har_tilgang()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hm_er_kontor();
$$;

comment on function public.hm_har_tilgang() is
  'Alias for hm_er_kontor(). Beholdt fordi sju policyer og åtte SECURITY DEFINER-funksjoner kaller den ved dette navnet; å bytte navn der ville betydd å skrive kroppene om fra hukommelsen. Ny kode bør kalle hm_er_kontor().';


-- ── 3. Rollen avgrenser noe nå ──
--
-- Normaliseres av samme grunn som over: klienten sammenligner svaret med
-- 'prosjekt' for å vite hvor brukeren skal sendes. Sto det 'Prosjekt' i basen,
-- ville hm_er_kontor() (som normaliserer) si nei, mens klienten ikke kjente
-- igjen rollen og lot ham bli stående i adminpanelet med et tomt skjermbilde.

create or replace function public.hm_rolle()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin() then 'super_admin'
    else (
      select btrim(lower(role)) from public.system_users
       where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       limit 1
    )
  end;
$$;

comment on function public.hm_rolle() is
  'Rollen til den innloggede: super_admin, eller role fra system_users. Null uten tilgang. Rollen prosjekt stenger ute fra admindelen og gir i stedet tilgang til egne prosjekter.';


-- ── 4. Stenger anon ute av vaktene, denne gongen på ordentleg ──
--
-- Sjå grunngjevinga over. Dei to eldre funksjonane fekk same halve revoke i
-- 20260812090000, og blir retta her medan vi er i same fila.

revoke all on function public.hm_har_tilgang() from public, anon;
revoke all on function public.hm_rolle() from public, anon;
grant execute on function public.hm_har_tilgang() to authenticated;
grant execute on function public.hm_rolle() to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 20260903090100_prosjekt_tabellar.sql
-- ══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- Prosjekt, bestilling og mottakskontroll.
--
-- Kjeden går motsatt vei av resten av appen: her kjøpes varer INN til et
-- prosjekt og kjøres rett fra leverandøren ut på byggeplassen.
--
--   plassen melder behov -> kontoret bestiller -> bilen kommer
--                        -> plassen kvitterer mot det bestilte
--
-- EGET LAGER ER IKKE INVOLVERT. Ingen beholdning trekkes ned, ingen
-- pipe_stock_log skrives, ingen faktura berøres. Det er et bevisst skille:
-- pipe_*-tabellene handler om varer firmaet EIER, project_*-tabellene om varer
-- firmaet KJØPER. Å blande dem ville betydd å skru av lagerlogikken i
-- pipe_submit_order og pipe_delete_order for halvparten av radene.
--
-- Navnekonvensjonen er hentet fra basen slik den står: tabeller og kolonner på
-- engelsk som pipe_orders.customer_name, statusverdier på norsk som
-- pipe_orders.status sine 'ny', 'behandlet', 'levert'.
-- ═══════════════════════════════════════════════════════════


-- ------------------------------------------------------------- prosjekt

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  -- Samme resonnement som order_number: hull i serien er greit, dette er ikke
  -- et regnskapsbilag.
  project_number bigserial not null unique,
  name text not null,
  client text,
  -- Leveringsadressen. Kontoret trenger den når han bestiller hos leverandøren.
  address text,
  status text not null default 'aktiv' check (status in ('aktiv', 'avsluttet')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists idx_projects_status on public.projects (status);

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated
  before update on public.projects
  for each row execute function public.pipe_touch_updated_at();


-- ------------------------------------------------------------- medlemmer
--
-- NØKKELEN ER E-POST, IKKE auth.uid().
--
-- Det er en bevisst videreføring av mønsteret i is_super_admin() og
-- hm_er_kontor(): en person kan settes på et prosjekt FØR han har registrert
-- seg, og tilgangen virker fra første innlogging. Med auth-id som nøkkel måtte
-- kontoen finnes først, og kontoret måtte vente på at folk registrerte seg før
-- han kunne forberede en byggeplass.

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- Unik på e-post i småbokstaver, så samme person ikke kan legges inn to ganger
-- med ulik skrivemåte og bli stående igjen etter én sletting.
create unique index if not exists idx_project_members_unique
  on public.project_members (project_id, lower(email));
create index if not exists idx_project_members_email
  on public.project_members (lower(email));


-- ------------------------------------------------------------- bestillingar

create table if not exists public.project_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigserial not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,

  -- meldt:   sendt til kontoret
  -- bestilt: kontoret har bestilt hos leverandøren
  -- delvis:  noe er mottatt, noe mangler
  -- mottatt: alt er kvittert
  -- avvist:  kontoret vil ikke bestille
  --
  -- Ingen 'utkast'. Designet nevnte det, men lista blir bygd i nettleseren og
  -- sendt inn hel – det finnes ingen kode som kan produsere en slik rad. En
  -- status ingenting kan skrive er en påstand om appen som ikke er sann, og den
  -- ville dukket opp i filtre og statusmerker uten å bety noe.
  status text not null default 'meldt'
    check (status in ('meldt', 'bestilt', 'delvis', 'mottatt', 'avvist')),

  needed_by date,
  note text,

  requested_by uuid default auth.uid(),
  -- Navnet fryses på raden. Fjernes brukeren fra system_users senere, skal det
  -- fortsatt stå hvem som meldte behovet.
  requested_by_name text,
  requested_at timestamptz,

  -- Kontorets felt
  supplier text,
  supplier_ref text,
  expected_at date,
  ordered_by uuid,
  ordered_at timestamptz,
  office_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_orders_project on public.project_orders (project_id, created_at desc);
create index if not exists idx_project_orders_status on public.project_orders (status);

drop trigger if exists trg_project_orders_updated on public.project_orders;
create trigger trg_project_orders_updated
  before update on public.project_orders
  for each row execute function public.pipe_touch_updated_at();


-- ------------------------------------------------------------- linjer
--
-- Linja bærer TO tall. requested_qty er det plassen ba om, ordered_qty er det
-- kontoret faktisk bestilte. Da fanges «kontoret bestilte 40 der plassen ba om
-- 50» uten to ordrebegreper som må holdes i sync.
--
-- Navnet fryses på linja, samme begrunnelse som prisene i pipe_order_lines:
-- endres katalogen i morgen, skal gårsdagens bestilling fortsatt vise hva som
-- faktisk ble bestilt.
--
-- INGEN PRISER HER. Prosjektbrukeren skal ikke se innkjøpspris, og bestillingen
-- er ikke et fakturagrunnlag.

create table if not exists public.project_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.project_orders(id) on delete cascade,
  -- Null for fritekstlinje: en kobling, en spesialdel, noe fra en annen
  -- leverandør. Byggeplassen skal ikke måtte ringe fordi katalogen mangler noe.
  pipe_type_id uuid references public.pipe_types(id) on delete set null,
  name text not null,
  dimension text,
  sku text,
  unit text not null default 'stk',
  requested_qty numeric not null check (requested_qty > 0),
  -- Null til kontoret har bestemt seg. 0 betyr strøket.
  ordered_qty numeric check (ordered_qty >= 0),
  line_note text,
  sort_order integer not null default 0
);

create index if not exists idx_project_order_lines_order on public.project_order_lines (order_id);
create index if not exists idx_project_order_lines_type on public.project_order_lines (pipe_type_id);


-- ------------------------------------------------------------- mottak
--
-- Én pulje. En bestilling kan komme i flere omganger, så mottaket er sin egen
-- rad framfor et felt på bestillingen. «Hva mangler fortsatt» er bestilt minus
-- summen av mottatt – utledet ved visning, aldri lagret, så det ikke kan komme
-- i utakt med mottakene.

create table if not exists public.project_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number bigserial not null unique,
  order_id uuid not null references public.project_orders(id) on delete cascade,
  received_at timestamptz not null default now(),
  received_by uuid default auth.uid(),
  received_by_name text not null,
  -- Samme rolle som signaturen på et uttak: dokumentasjonen på at varene
  -- faktisk kom, og hvem som sto der.
  signature text,
  note text,
  /*
   * Nøkkel klienten lager FØR den sender.
   *
   * En byggeplass har dårlig dekning. Går skrivingen gjennom, men svaret blir
   * borte på veien, får brukeren en feilmelding og trykker igjen – og uten
   * dette feltet blir det en pulje nummer to med de samme tallene, altså 20
   * mottatt av 10 bestilt. Med nøkkelen svarer det andre forsøket med det
   * samme mottaket som allerede ble skrevet.
   */
  client_ref uuid unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_receipts_order on public.project_receipts (order_id, received_at desc);


create table if not exists public.project_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.project_receipts(id) on delete cascade,
  order_line_id uuid not null references public.project_order_lines(id) on delete cascade,
  received_qty numeric not null check (received_qty >= 0),
  deviation text not null default 'ingen'
    check (deviation in ('ingen', 'mangler', 'skadet', 'feil_vare', 'for_mye')),
  note text
);

create index if not exists idx_project_receipt_lines_receipt on public.project_receipt_lines (receipt_id);
create index if not exists idx_project_receipt_lines_line on public.project_receipt_lines (order_line_id);


-- ═══════════════════════════════════════════════════════════
-- Vaktene
-- ═══════════════════════════════════════════════════════════

-- SECURITY DEFINER fordi den leser project_members, som en prosjektbruker ikke
-- har leserett til på tvers. Uten definer ville hver policy kalt en funksjon som
-- selv blir stoppet av en policy – en rekursjon Postgres avviser.
create or replace function public.hm_er_prosjektmedlem(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hm_er_kontor() or exists (
    select 1 from public.project_members m
     where m.project_id = p_project_id
       and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

comment on function public.hm_er_prosjektmedlem(uuid) is
  'Ser den innloggede dette prosjektet? Kontoret ser alle, prosjektbrukeren sine egne.';

revoke all on function public.hm_er_prosjektmedlem(uuid) from public, anon;
grant execute on function public.hm_er_prosjektmedlem(uuid) to authenticated;


-- Her sto hm_kan_endre_bestilling(). Den finnes ikke lenger: da skrivingen ble
-- kontorets alene, hadde ingen policy bruk for den, og en vaktfunksjon som
-- ingen kaller er en vakt man tror man har.


-- ═══════════════════════════════════════════════════════════
-- RLS
--
-- Ingenting her er offentlig. anon får ikke en eneste rad, og får det heller
-- ikke ved et uhell: rettighetene trekkes eksplisitt tilbake under, i tilfelle
-- prosjektets standardrettigheter deler ut noe til anon på nye tabeller.
-- ═══════════════════════════════════════════════════════════

alter table public.projects              enable row level security;
alter table public.project_members       enable row level security;
alter table public.project_orders        enable row level security;
alter table public.project_order_lines   enable row level security;
alter table public.project_receipts      enable row level security;
alter table public.project_receipt_lines enable row level security;

revoke all on public.projects              from anon;
revoke all on public.project_members       from anon;
revoke all on public.project_orders        from anon;
revoke all on public.project_order_lines   from anon;
revoke all on public.project_receipts      from anon;
revoke all on public.project_receipt_lines from anon;

grant select, insert, update, delete on public.projects              to authenticated;
grant select, insert, update, delete on public.project_members       to authenticated;
grant select, insert, update, delete on public.project_orders        to authenticated;
grant select, insert, update, delete on public.project_order_lines   to authenticated;
grant select, insert, update, delete on public.project_receipts      to authenticated;
grant select, insert, update, delete on public.project_receipt_lines to authenticated;

-- Sekvensene: anon ut, authenticated inn.
--
-- `revoke ... from anon` er ikke pedanteri. Supabase deler ut alt på nye
-- sekvenser til anon via default privileges, og `select` på en sekvens røper
-- hvor mange ordrer bedriften har hatt. Står i SAMME fil som tabellene, så
-- filen aldri viser til noe den ikke selv har opprettet.
revoke all on sequence public.projects_project_number_seq         from anon;
revoke all on sequence public.project_orders_order_number_seq     from anon;
revoke all on sequence public.project_receipts_receipt_number_seq from anon;

grant usage, select on sequence public.projects_project_number_seq         to authenticated;
grant usage, select on sequence public.project_orders_order_number_seq     to authenticated;
grant usage, select on sequence public.project_receipts_receipt_number_seq to authenticated;


-- ── prosjekt: se sine egne, bare kontoret kan opprette og endre ──

drop policy if exists "projects les" on public.projects;
create policy "projects les" on public.projects
  for select to authenticated
  using (public.hm_er_prosjektmedlem(id));

drop policy if exists "projects kontor" on public.projects;
create policy "projects kontor" on public.projects
  for all to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());


-- ── medlemmer: bare kontoret styrer hvem som er med ──
--
-- Prosjektbrukeren får se medlemslista på sine egne prosjekter (han skal kunne
-- se hvem andre som er på plassen), men ikke endre den.

drop policy if exists "project_members les" on public.project_members;
create policy "project_members les" on public.project_members
  for select to authenticated
  using (public.hm_er_prosjektmedlem(project_id));

drop policy if exists "project_members kontor" on public.project_members;
create policy "project_members kontor" on public.project_members
  for all to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());


-- ── bestillingar ──

drop policy if exists "project_orders les" on public.project_orders;
create policy "project_orders les" on public.project_orders
  for select to authenticated
  using (public.hm_er_prosjektmedlem(project_id));

/*
 * SKRIVING ER KONTORETS, MED ETT UNNTAK.
 *
 * En tidligere versjon lot prosjektmedlemmer sette inn og endre rader selv, med
 * `using` som krevde status 'meldt' men `with check` som bare krevde
 * medlemskap. Asymmetrien var et hull: `using` prøver den GAMLE raden, so en
 * `update ... set status = 'bestilt'` slapp gjennom — og da kunne plassen sette
 * sin egen ordered_qty først, altså skrive fasiten mottakskontrollen måles mot,
 * og deretter kvittere for den. Hele kjeden uten at kontoret var involvert.
 *
 * Innmelding går nå gjennom project_submit_request, som er SECURITY DEFINER og
 * derfor ikke trenger en insert-policy i det hele tatt. Da er det ingenting
 * igjen plassen må kunne skrive direkte — bortsett fra å trekke tilbake et
 * behov kontoret ennå ikke har bestilt.
 */
drop policy if exists "project_orders skriv" on public.project_orders;
create policy "project_orders skriv" on public.project_orders
  for insert to authenticated
  with check (public.hm_er_kontor());

drop policy if exists "project_orders endre" on public.project_orders;
create policy "project_orders endre" on public.project_orders
  for update to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());

drop policy if exists "project_orders slett" on public.project_orders;
create policy "project_orders slett" on public.project_orders
  for delete to authenticated
  using (
    public.hm_er_kontor()
    or (status = 'meldt' and public.hm_er_prosjektmedlem(project_id))
  );


-- ── linjer: følger bestillingen ──

drop policy if exists "project_order_lines les" on public.project_order_lines;
create policy "project_order_lines les" on public.project_order_lines
  for select to authenticated
  using (exists (
    select 1 from public.project_orders o
     where o.id = order_id and public.hm_er_prosjektmedlem(o.project_id)
  ));

-- Samme resonnement som over: linjene blir skrevet av project_submit_request,
-- og ordered_qty er fasiten. Lot vi plassen skrive her, kunne han sette den
-- selv. Å trekke tilbake et helt behov er nok — linjene følger med i fallet.
drop policy if exists "project_order_lines endre" on public.project_order_lines;
create policy "project_order_lines endre" on public.project_order_lines
  for all to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());


-- ── mottak: skrives gjennom project_submit_receipt, leses av begge ──
--
-- Ingen insert-policy med vilje. Et mottak skal skrives hele eller ikke i det
-- hele tatt, og statusen på bestillingen skal settes i samme transaksjon.
-- Derfor går skrivingen gjennom RPC-en, som er SECURITY DEFINER.

drop policy if exists "project_receipts les" on public.project_receipts;
create policy "project_receipts les" on public.project_receipts
  for select to authenticated
  using (exists (
    select 1 from public.project_orders o
     where o.id = order_id and public.hm_er_prosjektmedlem(o.project_id)
  ));

drop policy if exists "project_receipts kontor" on public.project_receipts;
create policy "project_receipts kontor" on public.project_receipts
  for all to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());

drop policy if exists "project_receipt_lines les" on public.project_receipt_lines;
create policy "project_receipt_lines les" on public.project_receipt_lines
  for select to authenticated
  using (exists (
    select 1 from public.project_receipts r
      join public.project_orders o on o.id = r.order_id
     where r.id = receipt_id and public.hm_er_prosjektmedlem(o.project_id)
  ));

drop policy if exists "project_receipt_lines kontor" on public.project_receipt_lines;
create policy "project_receipt_lines kontor" on public.project_receipt_lines
  for all to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());


-- ═══════════════════════════════════════════════════════════
-- Serverfunksjonene
--
-- To stykker, av samme grunn som pipe_submit_order finnes: skrivingen må være
-- hel eller ikke skje, og vakta må ligge i databasen framfor i grensesnittet.
-- Alt annet – opprette prosjekt, melde behov, legge til linjer – går som
-- vanlige tabellskriv under policyene over.
-- ═══════════════════════════════════════════════════════════


/*
 * Statusen ei bestilling SKAL ha, ut frå linjene sine.
 *
 * Eitt einaste stad, kalla frå både project_mark_ordered og
 * project_submit_receipt. Låg tidlegare som to kopiar, og då kunne dei bli
 * usamde – noko dei faktisk blei: den eine sette 'bestilt' ubetinga og rulla
 * dermed tilbake statusen til ei bestilling som alt var delvis motteken.
 *
 * Berre linjer som faktisk blei tinga tel med. Ei linje kontoret strauk
 * (ordered_qty = 0) skal ikkje halde bestillinga open.
 */
create or replace function public.project_recompute_status(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_bestilte integer;
  v_uferdige integer;
  v_motteke integer;
begin
  select status into v_status from public.project_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  -- 'meldt' og 'avvist' ligg før leveransen og skal ikkje rørast her
  if v_status in ('meldt', 'avvist') then
    return v_status;
  end if;

  select count(*) into v_bestilte
    from public.project_order_lines
   where order_id = p_order_id and coalesce(ordered_qty, 0) > 0;

  if v_bestilte = 0 then
    return v_status;
  end if;

  select
    count(*) filter (where mottatt < l.ordered_qty),
    count(*) filter (where mottatt > 0)
    into v_uferdige, v_motteke
  from public.project_order_lines l
  cross join lateral (
    select coalesce(sum(rl.received_qty), 0) as mottatt
      from public.project_receipt_lines rl
      join public.project_receipts r on r.id = rl.receipt_id
     where rl.order_line_id = l.id and r.order_id = p_order_id
  ) s
  where l.order_id = p_order_id and coalesce(l.ordered_qty, 0) > 0;

  v_status := case
    when v_uferdige = 0 then 'mottatt'
    when v_motteke > 0 then 'delvis'
    else 'bestilt'
  end;

  update public.project_orders set status = v_status where id = p_order_id;
  return v_status;
end;
$$;

revoke all on function public.project_recompute_status(uuid) from public, anon;
grant execute on function public.project_recompute_status(uuid) to authenticated;


-- Kontorets bekreftelse: hva som faktisk ble bestilt.
--
-- Dette er øyeblikket «forventet» får sin verdi. Etter dette er ordered_qty
-- fasiten mottakskontrollen måles mot.
create or replace function public.project_mark_ordered(
  p_order_id uuid,
  p_supplier text default null,
  p_supplier_ref text default null,
  p_expected_at date default null,
  p_lines jsonb default '[]'::jsonb,
  p_office_note text default null
)
returns public.project_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.project_orders;
  v_line jsonb;
  v_count integer;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  select * into v_order from public.project_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  if v_order.status in ('mottatt', 'avvist') then
    raise exception 'Bestillingen er allerede avsluttet';
  end if;

  -- Antallet settes per linje. En linje som ikke er nevnt beholder det den
  -- hadde, så kontoret kan bestille i to omganger uten å nullstille noe.
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    update public.project_order_lines
       set ordered_qty = greatest((v_line ->> 'ordered_qty')::numeric, 0)
     where id = (v_line ->> 'id')::uuid
       and order_id = p_order_id;
  end loop;

  -- En bestilling uten en eneste bestilt linje er ikke bestilt. Uten denne
  -- sjekken ville den stått som 'bestilt' og straks blitt 'mottatt' ved første
  -- mottak, fordi hver linje trivielt er fullt levert.
  select count(*) into v_count
    from public.project_order_lines
   where order_id = p_order_id and coalesce(ordered_qty, 0) > 0;

  if v_count = 0 then
    raise exception 'Ingen linjer er bestilt';
  end if;

  update public.project_orders
     set
         -- 'meldt' er steget FØR leveransen, og project_recompute_status rører
         -- den ikke. Overgangen meldt -> bestilt må derfor skje her; etterpå
         -- forfiner recompute til 'delvis' eller 'mottatt' hvis det alt finnes
         -- mottak, og lar en bestilling som allerede er delvis stå i fred.
         status = case when status = 'meldt' then 'bestilt' else status end,
         /*
          * DIREKTE TILORDNING, ikke coalesce.
          *
          * Panelet viser alle fire feltene som redigerbare og sender hele
          * skjemaet hver gang. Med coalesce kunne kontoret aldri TØMME et felt:
          * skrev han feil ordrenummer eller feil forventet dato og slettet det,
          * svarte appen «Bestillingen er registrert» — og verdien spratt
          * tilbake. Verst for expected_at, som driver «Skulle vært levert»-
          * varselet både hos plassen og på kontoret.
          *
          * Den som vil beholde en verdi, sender den med. Det gjør panelet.
          */
         supplier = p_supplier,
         supplier_ref = p_supplier_ref,
         expected_at = p_expected_at,
         office_note = p_office_note,
         ordered_by = auth.uid(),
         ordered_at = now()
   where id = p_order_id;

  /*
   * Statusen blir REKNA UT, ikkje sett til 'bestilt'.
   *
   * Kontoret opnar det same panelet for å skrive inn ordrenummeret frå Dahl på
   * ei bestilling som alt er delvis motteken. Sette vi 'bestilt' her, ville
   * mottaka blitt usynlege: plassen mista «mangler 4 m»-lista si, og kontoret
   * såg bestillinga som om ingenting var kome. Først ved neste mottak ville det
   * retta seg.
   */
  perform public.project_recompute_status(p_order_id);

  select * into v_order from public.project_orders where id = p_order_id;
  return v_order;
end;
$$;

revoke all on function public.project_mark_ordered(uuid, text, text, date, jsonb, text) from public, anon;
grant execute on function public.project_mark_ordered(uuid, text, text, date, jsonb, text) to authenticated;


-- Mottakskontrollen.
--
-- Skriver mottaket og linjene i én transaksjon og setter statusen på
-- bestillingen etterpå: 'mottatt' når hver bestilt linje er fullt levert, ellers
-- 'delvis'.
create or replace function public.project_submit_receipt(
  p_order_id uuid,
  p_received_by_name text,
  p_lines jsonb,
  p_signature text default null,
  p_note text default null,
  p_client_ref uuid default null
)
returns public.project_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.project_orders;
  v_receipt public.project_receipts;
  v_line jsonb;
  v_line_id uuid;
  v_qty numeric;
  v_deviation text;
  v_ordered numeric;
  v_mottatt_for numeric;
  v_skrivne integer := 0;
begin
  /*
   * Same nøkkel to gonger = same mottak.
   *
   * Dekninga på ein byggjeplass er som ho er. Går skrivinga gjennom men svaret
   * blir borte, får brukaren ei feilmelding og trykkjer om att. Utan denne
   * sjekken blei det ei pulje nummer to med dei same tala – 20 mottekne av 10
   * bestilte, og eit falskt 'for_mye' på kjøpet.
   */
  if p_client_ref is not null then
    select * into v_receipt from public.project_receipts where client_ref = p_client_ref;
    if found then
      return v_receipt;
    end if;
  end if;

  select * into v_order from public.project_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  if not public.hm_er_prosjektmedlem(v_order.project_id) then
    raise exception 'Ingen tilgang til dette prosjektet' using errcode = '42501';
  end if;

  if v_order.status not in ('bestilt', 'delvis') then
    raise exception 'Bestillingen er ikke bestilt ennå';
  end if;

  if coalesce(trim(p_received_by_name), '') = '' then
    raise exception 'Navn må fylles ut';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ingen linjer å kvittere for';
  end if;

  insert into public.project_receipts (order_id, received_by_name, signature, note, client_ref)
  values (p_order_id, trim(p_received_by_name), nullif(trim(coalesce(p_signature, '')), ''), p_note, p_client_ref)
  returning * into v_receipt;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_id := (v_line ->> 'order_line_id')::uuid;
    v_qty := coalesce((v_line ->> 'received_qty')::numeric, 0);
    v_deviation := coalesce(nullif(v_line ->> 'deviation', ''), 'ingen');

    -- Linja må høre til DENNE bestillingen. Uten sjekken kunne en innlogget
    -- prosjektbruker kvittert på en linje i et prosjekt han ikke er med på, ved
    -- å sende en fremmed id gjennom RPC-en.
    select coalesce(ordered_qty, 0) into v_ordered
      from public.project_order_lines
     where id = v_line_id and order_id = p_order_id;

    if not found then
      raise exception 'Linja hører ikke til bestillingen';
    end if;

    if v_qty < 0 then
      raise exception 'Mottatt antall kan ikke være negativt';
    end if;

    -- Hopp over linjer det ikke kom noe på. En tom rad er ikke informasjon.
    if v_qty = 0 and v_deviation = 'ingen' then
      continue;
    end if;

    -- Tel med linjer som alt er skrivne i DETTE mottaket òg (r.id <> v_receipt.id
    -- fanst her før, og då såg ei linje som kom to gonger i p_lines ikkje den
    -- første av dei – så for_mye-overstyringa bomma).
    select coalesce(sum(rl.received_qty), 0) into v_mottatt_for
      from public.project_receipt_lines rl
      join public.project_receipts r on r.id = rl.receipt_id
     where rl.order_line_id = v_line_id and r.order_id = p_order_id;

    -- Mer enn bestilt er lov – det er reell informasjon, på samme måte som at
    -- beholdningen får gå i minus i uttaksdelen. Men det skal aldri se rent ut.
    if v_mottatt_for + v_qty > v_ordered and v_deviation = 'ingen' then
      v_deviation := 'for_mye';
    end if;

    insert into public.project_receipt_lines (receipt_id, order_line_id, received_qty, deviation, note)
    values (v_receipt.id, v_line_id, v_qty, v_deviation, nullif(trim(coalesce(v_line ->> 'note', '')), ''));

    v_skrivne := v_skrivne + 1;
  end loop;

  if v_skrivne = 0 then
    raise exception 'Ingen linjer å kvittere for';
  end if;

  -- Same utrekninga som kontoret sitt kall bruker, så dei to aldri kan bli
  -- usamde om kva statusen skal vere.
  perform public.project_recompute_status(p_order_id);

  return v_receipt;
end;
$$;

revoke all on function public.project_submit_receipt(uuid, text, jsonb, text, text, uuid) from public, anon;
grant execute on function public.project_submit_receipt(uuid, text, jsonb, text, text, uuid) to authenticated;


/*
 * Melder inn eit behov: hovudrada og linjene i éin transaksjon.
 *
 * Låg tidlegare som to skrivingar frå klienten, med ei opprydding som sletta
 * hovudrada dersom linjene feila. Den oppryddinga kunne sjølv feile, og dett
 * nettet mellom dei to rundturane køyrer ho ikkje i det heile – då blir det
 * ståande att ei tom bestilling på kontorets liste som ingen kan fjerne
 * derifrå. Same grunn som pipe_submit_order finst.
 */
create or replace function public.project_submit_request(
  p_project_id uuid,
  p_requested_by_name text,
  p_lines jsonb,
  p_needed_by date default null,
  p_note text default null
)
returns public.project_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.project_orders;
  v_line jsonb;
  v_i integer := 0;
  v_qty numeric;
begin
  if not public.hm_er_prosjektmedlem(p_project_id) then
    raise exception 'Ingen tilgang til dette prosjektet' using errcode = '42501';
  end if;

  if coalesce(trim(p_requested_by_name), '') = '' then
    raise exception 'Navn må fylles ut';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Legg til minst én vare før du melder inn behovet';
  end if;

  insert into public.project_orders
    (project_id, status, requested_by, requested_by_name, requested_at, needed_by, note)
  values
    (p_project_id, 'meldt', auth.uid(), trim(p_requested_by_name), now(), p_needed_by, p_note)
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line ->> 'requested_qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Antallet må være større enn null';
    end if;

    insert into public.project_order_lines
      (order_id, pipe_type_id, name, dimension, sku, unit, requested_qty, line_note, sort_order)
    values (
      v_order.id,
      nullif(v_line ->> 'pipe_type_id', '')::uuid,
      coalesce(nullif(trim(v_line ->> 'name'), ''), 'Uten navn'),
      nullif(trim(coalesce(v_line ->> 'dimension', '')), ''),
      nullif(trim(coalesce(v_line ->> 'sku', '')), ''),
      coalesce(nullif(v_line ->> 'unit', ''), 'stk'),
      v_qty,
      nullif(trim(coalesce(v_line ->> 'line_note', '')), ''),
      v_i
    );
    v_i := v_i + 1;
  end loop;

  return v_order;
end;
$$;

revoke all on function public.project_submit_request(uuid, text, jsonb, date, text) from public, anon;
grant execute on function public.project_submit_request(uuid, text, jsonb, date, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 20260903090200_katalog_utan_innkjopspris.sql
-- ══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- Innkjøpsprisen ut av det offentlige.
--
-- Verifisert mot den levende basen 3. september 2026, med anon-nøkkelen og
-- uten innlogging:
--
--   GET /rest/v1/pipe_types?select=name,price,cost_price   ->  200
--       Overvannsrør X-Stream SN8   price 103   cost_price 66.7
--   GET /rest/v1/pipe_settings?select=markup_percent       ->  200
--       markup_percent 55
--
-- Enhver besøkende kunne lese netto innkjøpspris fra Dahl og påslaget, og
-- dermed regne ut dekningsbidraget per meter.
--
-- Dette er eldre enn prosjektdelen – «pipe_types read» har stått som
-- `for select using (true)` siden 20260810100000_rorlager_init.sql. Men det
-- rettes her, fordi rollen 'prosjekt' ellers ville vært ren pynt: en
-- byggeplassbruker som ikke skal se innkjøpspriser kunne bare logget ut og lest
-- dem som anonym.
--
--
-- HVORFOR EN VISNING OG IKKE KOLONNERETTIGHETER
--
-- RLS er radbasert og kan ikke skjule en kolonne. Kolonnerettigheter kan, men
-- de deles ut per databaserolle, og både kontorbrukeren og prosjektbrukeren er
-- `authenticated` – de kan altså ikke skilles der. En visning uten kolonnen er
-- det eneste som treffer riktig.
--
-- Visningen kjører med eierens rettigheter (security_invoker er av som
-- standard) og går derfor utenom RLS på pipe_types. Det er nettopp poenget, og
-- det er trygt her: visningen har ingen rader som skal skjules for noen. Hele
-- katalogen er offentlig – det er de to tallene som ikke er det.
--
-- Ingen where-klausul, så utvalget er nøyaktig som før. `active` er med som
-- kolonne og filtreres i klienten, slik det alltid har blitt gjort.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Katalogen, uten cost_price ──

create or replace view public.pipe_catalog as
  select
    id, category_id, name, dimension, sku, qr_slug, unit,
    price, stock, low_stock_threshold, location, color, description,
    active, sort_order, created_at, updated_at
  from public.pipe_types;

comment on view public.pipe_catalog is
  'Katalogen slik kunder og prosjektbrukere ser den. cost_price er med vilje ikke med – den er kontorets. Kjører med eierens rettigheter, så den når fram uten lesepolicy på pipe_types.';


-- ── 2. Innstillingene, uten markup_percent ──

create or replace view public.pipe_public_settings as
  select
    id, company_name, org_number, address, phone, email,
    intro_text, pickup_note, show_prices, require_phone, require_signature,
    vat_rate, updated_at
  from public.pipe_settings;

comment on view public.pipe_public_settings is
  'Innstillingene kundeflyten trenger. markup_percent er ikke med – påslaget er ikke kundens sak.';


-- ── 3. Steng basistabellene ──
--
-- Rekkefølgen er med vilje: visningene finnes FØR lesetilgangen tas bort, så
-- det ikke er et øyeblikk der katalogen er utilgjengelig for kundeflyten.

/*
 * REKKEFØLGEN ER IKKE VALGFRI: revoke FØR grant.
 *
 * `grant select` legger bare til. Supabase har
 * `alter default privileges in schema public grant all on tables to anon`, og
 * det gjelder VISNINGER også — så anon fikk hele settet i det visningen ble
 * opprettet:
 *
 *   pipe_catalog: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,...}
 *
 * En visning uten security_invoker kjører med eierens rettigheter, og eieren
 * er `postgres` med rolbypassrls. Det gjelder ikke bare lesing: en anonym
 * `DELETE FROM pipe_catalog` slo rett gjennom til pipe_types og tømte
 * katalogen. Verifisert mot en base bygd fra disse migrasjonene — 0 rader
 * igjen — og PostgREST ville rutet det som ett kall med den offentlige
 * anon-nøkkelen.
 *
 * Visningen skal bare kunne LESES. Da må alt annet tas bort først.
 */
revoke all on public.pipe_catalog         from anon, authenticated;
revoke all on public.pipe_public_settings from anon, authenticated;

grant select on public.pipe_catalog         to anon, authenticated;
grant select on public.pipe_public_settings to anon, authenticated;

-- `revoke select` alene ville latt INSERT, UPDATE, DELETE og TRUNCATE stå
-- igjen. RLS stopper de tre første, men RLS dekker ikke TRUNCATE.
revoke all on public.pipe_types    from anon;
revoke all on public.pipe_settings from anon;

-- Samme mangel fra 20260810100100: disse to fikk aldri noen tilbaketrekking.
-- Å tømme dem ville låst ute hele kontoret.
revoke all on public.system_users from anon;
revoke all on public.super_admins from anon;

-- Kategoriene SKAL være lesbare for kunden, men satt igjen med hele settet
-- (INSERT, UPDATE, DELETE, TRUNCATE) fordi de ikke trengte en visning. Samme
-- resonnement som over: RLS stopper de tre første, men ikke TRUNCATE.
revoke all on public.pipe_categories from anon;
grant select on public.pipe_categories to anon;

-- Policyene som slapp alle inn. Etter dette er det bare «pipe_types admin» og
-- «pipe_settings admin» igjen, og de spør hm_har_tilgang() – som nå betyr
-- kontoret. Prosjektbrukeren leser katalogen gjennom visningen som alle andre.
drop policy if exists "pipe_types read"    on public.pipe_types;
drop policy if exists "pipe_settings read" on public.pipe_settings;


-- ── 4. Sekvensen anon ikke trenger ──
--
-- `grant usage, select on sequence pipe_orders_order_number_seq to anon` sto i
-- init-migrasjonen. Innsettingen skjer inne i pipe_submit_order, som er
-- SECURITY DEFINER og kjører med eierens rettigheter, så anon har aldri trengt
-- den. `select` på sekvensen røper hvor mange uttak bedriften har hatt.
--
-- Jeg har ikke klart å vise en utnyttelsesvei gjennom PostgREST, så dette er
-- ryddighet, ikke en tetting av noe åpent. Men grunnrettigheten er feil, og
-- `setval` fra rå SQL ville rotet til nummerserien.

-- Berre pipe_*-sekvensene her. Prosjektsekvensene blir trukket tilbake i
-- migrasjonen som oppretter dem — en fil skal ikke kunne feile på et objekt
-- den ikke selv lager.
revoke all on sequence public.pipe_orders_order_number_seq     from anon;
revoke all on sequence public.pipe_invoices_invoice_number_seq from anon;

-- ══════════════════════════════════════════════════════════════════════
-- 20260903091000_epost_utan_store_bokstavar.sql
-- ══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- Én person, én rad — uansett store bokstaver.
--
-- system_users.email har `unique`, som er BOKSTAVFØLSOM. Men hver eneste
-- oppslagsfunksjon slår opp med lower():
--
--   is_super_admin()        lower(email) = lower(auth.jwt() ->> 'email')
--   hm_er_kontor()          samme
--   hm_rolle()              samme, og med `limit 1` uten `order by`
--   hm_er_prosjektmedlem()  samme, mot project_members
--
-- Fantes både 'Ola@Firma.no' og 'ola@firma.no', ville den unike skranken sluppet
-- begge gjennom, og hm_er_kontor() bruker `exists(...)` — én rad med rolle ulik
-- 'prosjekt' er nok til full kontortilgang. En nedgradering til 'prosjekt' på
-- den ene raden ville altså ikke bitt. Og hm_rolle() kunne svart hva som helst
-- av de to.
--
-- Ingen kjent vei inn i dag: alt som skriver tvinger små bokstaver. Men
-- skranken sier noe annet enn oppslaget gjør, og i en base som kan deles med en
-- annen app er det ikke en forskjell man vil leve med.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Normaliser det som finnes ──
--
-- Bare rader der en småskrevet variant IKKE allerede finnes. Ellers ville
-- oppdateringen kollidert med den unike skranken og veltet hele migrasjonen —
-- og en migrasjon som kan feile på data er ikke en migrasjon, det er en felle.

update public.system_users s
   set email = lower(email)
 where email <> lower(email)
   and not exists (
     select 1 from public.system_users t
      where t.id <> s.id and t.email = lower(s.email)
   );

update public.project_members m
   set email = lower(email)
 where email <> lower(email)
   and not exists (
     select 1 from public.project_members t
      where t.id <> m.id and t.project_id = m.project_id and lower(t.email) = lower(m.email)
   );


-- ── 2. Skranken som stemmer med oppslaget ──
--
-- Kommer den ikke opp, står det igjen dubletter fra før migrasjonen. Da vil
-- Postgres si det, og de må ryddes for hånd — det er riktigere enn å gjette
-- hvilken av dem som er den ekte.

create unique index if not exists idx_system_users_epost_lower
  on public.system_users (lower(email));

comment on index public.idx_system_users_epost_lower is
  'Én rad per person. Den vanlige unique-skranken på email er bokstavfølsom, mens hm_er_kontor() og hm_rolle() slår opp med lower() — uten denne kunne samme person hatt to rader med ulik rolle.';

-- ══════════════════════════════════════════════════════════════════════
-- 20260903092000_mottaksbilde.sql
-- ══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- Bildedokumentasjon på mottakskontrollen.
--
-- Bildet er det som avgjør en reklamasjon. Ord mot ord om en sprukken palle
-- blir fort dyrt, og fotografiet er det eneste som ikke kan bestrides i
-- ettertid.
--
--
-- BILDENE ER PERSONOPPLYSNINGER
--
-- Et bilde fra en byggeplass kan vise folk. Derfor:
--
--   * Bøtta er PRIVAT. Ingen offentlige URL-er, bare signerte lenker med kort
--     levetid. En offentlig bøtte ville lagt bildene åpent på nettet for den
--     som gjettet stien.
--   * Tilgangen følger prosjektet. Den som ikke er på prosjektet, ser ikke
--     bildene — hverken gjennom appen eller direkte mot Storage.
--   * Stien starter med prosjekt-id, nettopp så policyen kan avgjøre tilgang
--     uten å slå opp i en tabell.
--
-- Personvernerklæringen er oppdatert i samme slengen. Det er ikke en formalitet:
-- informasjonsplikten gjelder når opplysningene samles inn, ikke etterpå.
--
--
-- HVORFOR STIEN BRUKER client_ref
--
-- Bildene lastes opp FØR mottaket finnes — brukeren skal se dem før han
-- kvitterer. Da finnes det ingen receipt_id å legge dem under. client_ref er
-- laget i nettleseren før første forsøk og er allerede nøkkelen som gjør
-- innsendingen idempotent, så den fungerer som mappe også.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Bildene som hører til et mottak ──

create table if not exists public.project_receipt_photos (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.project_receipts(id) on delete cascade,
  /** Sti i bøtta: <project_id>/<client_ref>/<filnavn> */
  path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_receipt_photos_receipt
  on public.project_receipt_photos (receipt_id);

alter table public.project_receipt_photos enable row level security;

revoke all on public.project_receipt_photos from anon;
grant select, insert, delete on public.project_receipt_photos to authenticated;

drop policy if exists "project_receipt_photos les" on public.project_receipt_photos;
create policy "project_receipt_photos les" on public.project_receipt_photos
  for select to authenticated
  using (exists (
    select 1
      from public.project_receipts r
      join public.project_orders o on o.id = r.order_id
     where r.id = receipt_id and public.hm_er_prosjektmedlem(o.project_id)
  ));

-- Skriving går gjennom project_submit_receipt, som er SECURITY DEFINER.
drop policy if exists "project_receipt_photos kontor" on public.project_receipt_photos;
create policy "project_receipt_photos kontor" on public.project_receipt_photos
  for all to authenticated
  using (public.hm_er_kontor())
  with check (public.hm_er_kontor());


-- ── 2. Grunnen til at bildet mangler ──
--
-- Bilde er påkrevd, men dekningen på en byggeplass er som den er. Går
-- opplastingen ikke gjennom, skal ikke hele leveransen stoppe opp mens
-- sjåføren venter — plassen krysser av og skriver hvorfor, og kontoret ser at
-- bildet mangler og av hvilken grunn.
--
-- Et påkrevd felt som ikke kan omgås blir omgått på andre måter: da kvitterer
-- ingen, eller de kvitterer for tidlig fra et sted med dekning.

alter table public.project_receipts
  add column if not exists no_photo_reason text;

comment on column public.project_receipts.no_photo_reason is
  'Satt når mottaket ble registrert uten bilde. Enten dette eller minst ett bilde må finnes — se project_submit_receipt.';


-- ── 3. Bøtta ──
--
-- public = false. Dette er hele personvernstiltaket: uten det ville hvem som
-- helst med stien kunnet hente bildet uten innlogging.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mottak-bilder', 'mottak-bilder', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8388608,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];


-- ── 4. Hvem som kommer til bildene ──
--
-- storage.foldername(name) gir stien som array. Første ledd er prosjekt-id, og
-- det er nok til å avgjøre tilgang uten et tabelloppslag.
--
-- Merk at dette gjelder direkte mot Storage-API-et, ikke bare gjennom appen.
-- En prosjektbruker som gjetter stien til et annet prosjekt får ingenting.

-- I en DO-blokk med vilje.
--
-- storage.objects eies av supabase_storage_admin, ikke av rollen SQL Editor
-- kjører som. Det pleier å gå bra — Supabase gir postgres rett til å styre
-- policyer der, og det er den dokumenterte framgangsmåten — men går det ikke,
-- skal ikke HELE skjemaet rulle tilbake på grunn av det.
--
-- Feiler den, er tilstanden trygg, ikke utrygg: en bøtte uten policyer er
-- utilgjengelig for alle andre enn service_role. Men da virker ikke
-- opplastingen, og meldingen under sier hva som må gjøres.

do $$
begin
  drop policy if exists "mottaksbilde les" on storage.objects;
  create policy "mottaksbilde les" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'mottak-bilder'
      and public.hm_er_prosjektmedlem(((storage.foldername(name))[1])::uuid)
    );

  drop policy if exists "mottaksbilde skriv" on storage.objects;
  create policy "mottaksbilde skriv" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'mottak-bilder'
      and public.hm_er_prosjektmedlem(((storage.foldername(name))[1])::uuid)
    );

  -- Sletting er kontorets. Plassen skal ikke kunne fjerne dokumentasjon i
  -- ettertid — det er nettopp derfor bildet er der.
  drop policy if exists "mottaksbilde slett" on storage.objects;
  create policy "mottaksbilde slett" on storage.objects
    for delete to authenticated
    using (bucket_id = 'mottak-bilder' and public.hm_er_kontor());

exception when insufficient_privilege or wrong_object_type then
  raise warning 'Fikk ikke satt policyene på storage.objects (%). Alt annet er på plass, men bildeopplasting vil ikke virke før de er laget. Se README under «Bilde i mottakskontrollen».', sqlerrm;
end $$;


-- ── 5. Kravet håndheves i databasen ──
--
-- Ikke bare i grensesnittet. En klient kan alltid la være å sende feltet, og et
-- krav som bare finnes i React er ikke et krav.

create or replace function public.project_submit_receipt(
  p_order_id uuid,
  p_received_by_name text,
  p_lines jsonb,
  p_signature text default null,
  p_note text default null,
  p_client_ref uuid default null,
  p_photos text[] default null,
  p_no_photo_reason text default null
)
returns public.project_receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.project_orders;
  v_receipt public.project_receipts;
  v_line jsonb;
  v_line_id uuid;
  v_qty numeric;
  v_deviation text;
  v_ordered numeric;
  v_mottatt_for numeric;
  v_skrivne integer := 0;
  v_bilde text;
  v_grunn text;
begin
  -- Same nøkkel to gonger = same mottak. Se 20260903090100.
  if p_client_ref is not null then
    select * into v_receipt from public.project_receipts where client_ref = p_client_ref;
    if found then
      return v_receipt;
    end if;
  end if;

  select * into v_order from public.project_orders where id = p_order_id;
  if not found then
    raise exception 'Fant ikke bestillingen';
  end if;

  if not public.hm_er_prosjektmedlem(v_order.project_id) then
    raise exception 'Ingen tilgang til dette prosjektet' using errcode = '42501';
  end if;

  if v_order.status not in ('bestilt', 'delvis') then
    raise exception 'Bestillingen er ikke bestilt ennå';
  end if;

  if coalesce(trim(p_received_by_name), '') = '' then
    raise exception 'Navn må fylles ut';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ingen linjer å kvittere for';
  end if;

  -- Bilde, eller en grunn til at det mangler. Aldri ingen av delene.
  v_grunn := nullif(trim(coalesce(p_no_photo_reason, '')), '');
  if coalesce(array_length(p_photos, 1), 0) = 0 and v_grunn is null then
    raise exception 'Legg ved minst ett bilde, eller skriv hvorfor det ikke lot seg gjøre';
  end if;

  insert into public.project_receipts
    (order_id, received_by_name, signature, note, client_ref, no_photo_reason)
  values (
    p_order_id,
    trim(p_received_by_name),
    nullif(trim(coalesce(p_signature, '')), ''),
    p_note,
    p_client_ref,
    v_grunn
  )
  returning * into v_receipt;

  foreach v_bilde in array coalesce(p_photos, array[]::text[])
  loop
    -- Stien må ligge under prosjektet mottaket hører til. Uten sjekken kunne
    -- en klient knyttet et bilde fra et annet prosjekt til sitt eget mottak.
    if v_bilde not like v_order.project_id::text || '/%' then
      raise exception 'Bildet hører ikke til dette prosjektet';
    end if;

    insert into public.project_receipt_photos (receipt_id, path)
    values (v_receipt.id, v_bilde)
    on conflict (path) do nothing;
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_id := (v_line ->> 'order_line_id')::uuid;
    v_qty := coalesce((v_line ->> 'received_qty')::numeric, 0);
    v_deviation := coalesce(nullif(v_line ->> 'deviation', ''), 'ingen');

    select coalesce(ordered_qty, 0) into v_ordered
      from public.project_order_lines
     where id = v_line_id and order_id = p_order_id;

    if not found then
      raise exception 'Linja hører ikke til bestillingen';
    end if;

    if v_qty < 0 then
      raise exception 'Mottatt antall kan ikke være negativt';
    end if;

    if v_qty = 0 and v_deviation = 'ingen' then
      continue;
    end if;

    select coalesce(sum(rl.received_qty), 0) into v_mottatt_for
      from public.project_receipt_lines rl
      join public.project_receipts r on r.id = rl.receipt_id
     where rl.order_line_id = v_line_id and r.order_id = p_order_id;

    if v_mottatt_for + v_qty > v_ordered and v_deviation = 'ingen' then
      v_deviation := 'for_mye';
    end if;

    insert into public.project_receipt_lines (receipt_id, order_line_id, received_qty, deviation, note)
    values (v_receipt.id, v_line_id, v_qty, v_deviation, nullif(trim(coalesce(v_line ->> 'note', '')), ''));

    v_skrivne := v_skrivne + 1;
  end loop;

  if v_skrivne = 0 then
    raise exception 'Ingen linjer å kvittere for';
  end if;

  perform public.project_recompute_status(p_order_id);

  return v_receipt;
end;
$$;

revoke all on function public.project_submit_receipt(uuid, text, jsonb, text, text, uuid, text[], text) from public, anon;
grant execute on function public.project_submit_receipt(uuid, text, jsonb, text, text, uuid, text[], text) to authenticated;

-- Den gamle signaturen ville ellers blitt liggende igjen som en vei rundt
-- bildekravet.
drop function if exists public.project_submit_receipt(uuid, text, jsonb, text, text, uuid);
