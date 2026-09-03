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
