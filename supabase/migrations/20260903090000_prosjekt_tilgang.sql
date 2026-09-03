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
