-- Revisjonsspor: kven endra kva, og når.
--
-- Prisar, påslag, rettingar av uttak, slettingar og tilgangar kunne endrast
-- utan at det stod nokon stad. Lagerloggen fortel om beholdninga; dette fortel
-- om resten. Same tabell gir prishistorikken per vare.
--
-- Triggerar skriv, ikkje appen: ein endring som går utanom panelet – SQL
-- Editor, eit skript, ein ny funksjon – blir òg med. Kunden sine
-- personopplysningar er ikkje blant felta som blir loggførte.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

create table if not exists public.pipe_revisjon (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text,
  tabell text not null,
  rad_id text,
  -- Kva det gjeld, lesbart: «PVC 110 mm», «#1042», «ola@hauge.no»
  kva text,
  handling text not null check (handling in ('ny', 'endret', 'slettet')),
  -- endret: { felt: { fra, til } }. ny/slettet: { felt: verdi }
  endringar jsonb not null default '{}'::jsonb
);

create index if not exists idx_pipe_revisjon_tid on public.pipe_revisjon (created_at desc);
create index if not exists idx_pipe_revisjon_rad on public.pipe_revisjon (tabell, rad_id, created_at desc);

alter table public.pipe_revisjon enable row level security;

drop policy if exists "pipe_revisjon les" on public.pipe_revisjon;
create policy "pipe_revisjon les" on public.pipe_revisjon
  for select to authenticated using (public.hm_er_kontor());

-- Berre lesing. Ingen kan skrive, endre eller slette i sporet frå appen –
-- eit revisjonsspor ein kan rette i, er ikkje eit spor.
revoke all on public.pipe_revisjon from public, anon, authenticated;
grant select on public.pipe_revisjon to authenticated;


/*
 * Den same triggeren for alle tabellane.
 *
 *   tg_argv[0]  felta som blir følgde, kommaskilde
 *   tg_argv[1]  felta som seier kva rada er (namn, nummer), kommaskilde
 *
 * Ved endring blir berre felt som faktisk er endra, skrivne. Blir ingen av
 * dei endra (til dømes berre beholdninga), blir det ingen rad.
 */
create or replace function public.pipe_revisjon_logg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_felt text[] := string_to_array(tg_argv[0], ',');
  v_namn text[] := string_to_array(coalesce(nullif(tg_argv[1], ''), 'id'), ',');
  v_gamal jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_ny jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_rad jsonb := coalesce(v_ny, v_gamal);
  v_endring jsonb := '{}'::jsonb;
  v_kva text;
  f text;
begin
  if tg_op = 'UPDATE' then
    foreach f in array v_felt loop
      if (v_gamal -> f) is distinct from (v_ny -> f) then
        v_endring := v_endring || jsonb_build_object(f, jsonb_build_object('fra', v_gamal -> f, 'til', v_ny -> f));
      end if;
    end loop;
    if v_endring = '{}'::jsonb then
      return new;
    end if;
  else
    foreach f in array v_felt loop
      v_endring := v_endring || jsonb_build_object(f, v_rad -> f);
    end loop;
  end if;

  select string_agg(v_rad ->> n, ' ') into v_kva
    from unnest(v_namn) as n
   where nullif(v_rad ->> n, '') is not null;

  insert into public.pipe_revisjon (created_by_name, tabell, rad_id, kva, handling, endringar)
  values (
    coalesce(public.hm_mitt_namn(), 'System'),
    tg_table_name,
    v_rad ->> 'id',
    v_kva,
    case tg_op when 'INSERT' then 'ny' when 'UPDATE' then 'endret' else 'slettet' end,
    v_endring
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.pipe_revisjon_logg() from public, anon, authenticated;


-- Varene: pris, kostpris, namn og om dei er aktive. Ikkje beholdninga – det er
-- lagerloggen si.
drop trigger if exists trg_revisjon_pipe_types on public.pipe_types;
create trigger trg_revisjon_pipe_types
  after insert or update or delete on public.pipe_types
  for each row execute function public.pipe_revisjon_logg(
    'name,dimension,sku,price,cost_price,active,low_stock_threshold,category_id,qr_slug', 'name,dimension');

-- Innstillingane, med påslaget
drop trigger if exists trg_revisjon_pipe_settings on public.pipe_settings;
create trigger trg_revisjon_pipe_settings
  after update on public.pipe_settings
  for each row execute function public.pipe_revisjon_logg(
    'company_name,org_number,address,phone,email,show_prices,require_phone,require_signature,vat_rate,markup_percent,accept_orders,order_email,payment_terms_days,stock_project_id', 'company_name');

-- Ordrar: prosjekt, status, faktura og sletting. Ikkje oppretting (ordren er
-- sitt eige spor) og ikkje summen (han følgjer linjene, som blir følgde under).
drop trigger if exists trg_revisjon_pipe_orders on public.pipe_orders;
create trigger trg_revisjon_pipe_orders
  after update or delete on public.pipe_orders
  for each row execute function public.pipe_revisjon_logg('order_number,status,project,project_id,invoice_id', 'order_number');

-- Linjene: mengd, vare og pris – det rettingane, returane og prisinga gjer
drop trigger if exists trg_revisjon_pipe_order_lines on public.pipe_order_lines;
create trigger trg_revisjon_pipe_order_lines
  after update or delete on public.pipe_order_lines
  for each row execute function public.pipe_revisjon_logg('order_id,name,quantity,pipe_type_id,unit_price', 'name,dimension');

-- Fakturagrunnlag: laga og sletta
drop trigger if exists trg_revisjon_pipe_invoices on public.pipe_invoices;
create trigger trg_revisjon_pipe_invoices
  after insert or delete on public.pipe_invoices
  for each row execute function public.pipe_revisjon_logg('invoice_number,total,period_from,period_to', 'invoice_number');

-- Tilgang: kven fekk kva rolle, og av kven
drop trigger if exists trg_revisjon_system_users on public.system_users;
create trigger trg_revisjon_system_users
  after insert or update or delete on public.system_users
  for each row execute function public.pipe_revisjon_logg('email,full_name,role', 'email');


-- Sporet blir ikkje liggjande for alltid: seks år, same som rekneskapen.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rorlager-rydd-revisjon', '30 3 * * *',
      $job$delete from public.pipe_revisjon where created_at < now() - interval '6 years'$job$);
  end if;
exception
  when insufficient_privilege or undefined_function or invalid_schema_name then
    raise warning 'Fikk ikke satt opp rydding av revisjonssporet (%).', sqlerrm;
end $$;
