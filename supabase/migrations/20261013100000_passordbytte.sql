-- Eige passord ved første innlogging.
--
-- Superadmin vel eit mellombels passord når han opprettar ein brukar, eller
-- når han set eit nytt frå nøkkelikonet. Det passordet kjenner han sjølv, så
-- den tilsette skal velje sitt eige før han kjem vidare. Serverfunksjonen
-- opprett-bruker set merket; den tilsette fjernar det når passordet er bytt.
--
-- Merket er ei vakt i appen, ikkje i innlogginga til Supabase. Ein som kan
-- kalle hm_passord_byttet() direkte, kan fjerne sitt eige merke utan å byte –
-- men då står han berre att med eit passord superadmin kjenner. Det skadar
-- ingen andre enn han sjølv, og eit merke han ikkje kan røre ville kravd at
-- passordbytet gjekk gjennom ein serverfunksjon i staden for rett til Supabase.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

alter table public.system_users add column if not exists ma_bytte_passord boolean not null default false;

comment on column public.system_users.ma_bytte_passord is
  'Sant til brukaren har valt sitt eige passord. Blir sett av opprett-bruker når superadmin gir eit mellombels passord.';

/*
 * Må den innlogga byte passord før han kjem vidare?
 *
 * SECURITY DEFINER fordi system_users berre kan lesast av ein superadmin. Ein
 * brukar utan rad i registeret – til dømes superadmin sjølv – får false.
 */
create or replace function public.hm_ma_bytte_passord()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.ma_bytte_passord
       from public.system_users s
      where lower(s.email) = lower(auth.jwt() ->> 'email')
      limit 1),
    false
  )
$$;

revoke all on function public.hm_ma_bytte_passord() from public, anon;
grant execute on function public.hm_ma_bytte_passord() to authenticated;

/*
 * Den innlogga har valt sitt eige passord.
 *
 * Rører berre rada med e-posten frå innlogginga. Ingen parameter, så det finst
 * ingen måte å peike funksjonen på nokon andre.
 */
create or replace function public.hm_passord_byttet()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.system_users
     set ma_bytte_passord = false
   where lower(email) = lower(auth.jwt() ->> 'email')
     and ma_bytte_passord
$$;

revoke all on function public.hm_passord_byttet() from public, anon;
grant execute on function public.hm_passord_byttet() to authenticated;
