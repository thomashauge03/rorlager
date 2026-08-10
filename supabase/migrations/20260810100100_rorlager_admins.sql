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
