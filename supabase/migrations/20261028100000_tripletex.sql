-- Tripletex: eit fakturagrunnlag blir ein ORDRE i Tripletex, med PDF-en ved.
--
-- Same oppsett som i grus-appen (hauge-maskin-grus, docs/superpowers/
-- TRIPLETEX-OVERLEVERING.md), men slankare: ordren har éi linje,
-- «Pris ihht vedlegg», med heile grunnlaget eks. mva, og PDF-en ligg ved og
-- følgjer neste faktura. Kunden kontrollerer mengdene mot vedlegget.
--
-- STÅANDE REGLAR, same som i grus:
--
--   * Ordre, aldri faktura. Eit menneske i Tripletex fakturerer.
--   * Integrasjonen slettar aldri noko i Tripletex.
--   * Bryteren er fra_dato. NULL = av: triggeren legg ingenting i køen, og
--     edge-funksjonen sender ingenting. Berre superadmin kan setje han.
--   * Grunnlag laga før fra_dato kjem aldri i køen, uansett kva nokon trykkjer.
--   * Svarteksten frå Tripletex blir aldri lagra (utviklarvilkåra punkt 2.2.4):
--     siste_feil og vedlegg_feil held berre HTTP-status, feilkode og vår eigen
--     tekst. Det er edge-funksjonen som held den regelen.
--   * Forskjellen mellom «kan finnast» og «finst ikkje» er eit eige ord, aldri
--     ei formulering. Eit panel som må lese ei setning for å vite om det er trygt
--     å sende, går i stykke den dagen nokon skriv om setninga – og prisen er ein
--     dobbel faktura.
--
-- Alt som tek ei rad (ta / utfall) er SECURITY DEFINER og berre for
-- service_role, altså edge-funksjonen tripletex-ordre. Låsinga skjer her, i éi
-- transaksjon med FOR UPDATE, så ho kan prøvast i PGlite
-- (scripts/db-test/tripletex.test.mjs) og ikkje berre stolast på.
--
-- Må tole å bli køyrd om att.


-- ═══════════════════════════════════════════════════════════════════
--  Innstillingane: éi rad
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.pipe_tripletex_innstilling (
  id boolean primary key default true check (id),
  -- NULL = integrasjonen er AV. Sjå toppen av fila.
  fra_dato date,
  -- Produktnummeret slik kontoret ser det i Tripletex, ikkje den interne id-en.
  -- Edge-funksjonen slår det opp. Tekst: produktnummer kan ha bokstavar.
  produkt_nr text check (produkt_nr is null or length(produkt_nr) between 1 and 50),
  -- Kundenummeret til felleskontoen for interne uttak (ansatte til eigne jobbar)
  felleskunde_nr integer check (felleskunde_nr is null or felleskunde_nr > 0),
  forfall_dagar integer not null default 14 check (forfall_dagar between 0 and 365),
  endret timestamptz,
  endret_av text
);

insert into public.pipe_tripletex_innstilling (id) values (true) on conflict (id) do nothing;

comment on column public.pipe_tripletex_innstilling.fra_dato is
  'NULL = Tripletex er AV. Satt: grunnlag laget fra og med denne datoen blir ordre. Bare superadmin.';

create or replace function public.pipe_tripletex_innstilling_spor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := true;
  new.endret := now();
  new.endret_av := coalesce(auth.jwt() ->> 'email', new.endret_av);
  return new;
end;
$$;

revoke all on function public.pipe_tripletex_innstilling_spor() from public, anon, authenticated;

drop trigger if exists trg_pipe_tripletex_innstilling_spor on public.pipe_tripletex_innstilling;
create trigger trg_pipe_tripletex_innstilling_spor
  before update on public.pipe_tripletex_innstilling
  for each row execute function public.pipe_tripletex_innstilling_spor();


-- ═══════════════════════════════════════════════════════════════════
--  Kundekoplingane: kunden i appen → kundenummer i Tripletex
-- ═══════════════════════════════════════════════════════════════════
--
-- Nøkkelen er den same som fakturafana grupperer på (fakturakunde() i
-- src/lib/fakturakunde.ts). Ei bedrift med org.nr. blir funnen i Tripletex av
-- seg sjølv; denne tabellen er for resten, og eit val kontoret har gjort går
-- føre org.nr.-et. Berre koplingar som har gitt ein ekte kunde i Tripletex blir
-- lagra (pipe_tripletex_hugs_kunde, kalla av edge-funksjonen).

create table if not exists public.pipe_tripletex_kunde (
  kunde_nokkel text primary key check (length(kunde_nokkel) between 1 and 500),
  kundenr integer not null check (kundenr > 0),
  koblet_av text,
  koblet_at timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════
--  Køen: éi rad per grunnlag
-- ═══════════════════════════════════════════════════════════════════
--
-- invoice_id er UNIK (same grunnlag kan ikkje bli to ordrar), men ikkje
-- primærnøkkel og ikkje cascade: blir grunnlaget sletta, skal rada som hugsar at
-- det finst ein ordre i Tripletex, stå att. Grus-appen gjorde den feilen i
-- første utkast.

create table if not exists public.pipe_tripletex_ko (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid unique references public.pipe_invoices(id) on delete set null,
  grunnlag_nr bigint not null,
  status text not null default 'venter',
  -- Sant når admin har sagt at dette er internt: ordren går på felleskontoen
  intern boolean not null default false,
  forsok integer not null default 0,
  siste_feil text,
  -- Den interne id-en til ordren i Tripletex, ikkje ordrenummeret
  tripletex_ordre_id bigint,
  vedlegg_status text,
  vedlegg_feil text,
  vedlegg_endret timestamptz,
  kontrollert_av text,
  kontrollert_at timestamptz,
  -- Bestillingane grunnlaget hadde, skrive av pipe_delete_invoice FØR dei blir
  -- kopla frå. Er grunnlaget angra etter at ordren fanst, er det berre her ein
  -- kan sjå at eit nytt grunnlag av dei same ville gitt kunden to fakturaer.
  bestilling_ider uuid[],
  opprettet timestamptz not null default now(),
  endret timestamptz not null default now()
);

alter table public.pipe_tripletex_ko drop constraint if exists pipe_tripletex_ko_status_check;
alter table public.pipe_tripletex_ko add constraint pipe_tripletex_ko_status_check check (status in (
  'venter',          -- i kø, ikkje sendt. Send er trygt
  'under_sending',   -- eit kall er hos Tripletex no. Over fem minutt: kallet døydde
  'sendt',           -- ordren finst i Tripletex, id-en står i tripletex_ordre_id
  'mangler_kunde',   -- fann ingen kunde i Tripletex. Ingenting er oppretta
  'feilet',          -- Tripletex avviste. Ingenting er oppretta
  'ukjent_utfall',   -- ordren KAN finnast. Aldri Send før nokon har sett i Tripletex
  'kontrollert',     -- eit menneske har sett ordren i Tripletex. Låst for alltid
  'sletta_grunnlag'  -- grunnlaget er angra før noko kom til Tripletex
));

alter table public.pipe_tripletex_ko drop constraint if exists pipe_tripletex_ko_vedlegg_check;
alter table public.pipe_tripletex_ko add constraint pipe_tripletex_ko_vedlegg_check check (
  vedlegg_status is null or vedlegg_status in (
    'laster_opp',  -- eit kall er hos Tripletex no. Over fem minutt: PDF-en KAN liggje ved
    'lagt_ved',    -- PDF-en ligg på ordren. Blir aldri send igjen
    'feilet',      -- avvist, eller for stor. Ingenting er lagt ved
    'ukjent'       -- tidsavbrot eller 5xx: PDF-en KAN liggje ved
  )
);

create index if not exists idx_pipe_tripletex_ko_utan_grunnlag
  on public.pipe_tripletex_ko (opprettet) where invoice_id is null;

comment on column public.pipe_tripletex_ko.status is
  'venter | under_sending | sendt | mangler_kunde | feilet | ukjent_utfall | kontrollert | sletta_grunnlag. Bare venter, feilet og mangler_kunde kan sendes.';


-- ═══════════════════════════════════════════════════════════════════
--  Tilgang
-- ═══════════════════════════════════════════════════════════════════
--
-- Kontoret les. Ingen skriv direkte i køen: alt går gjennom funksjonane under.
-- Innstillingane kan berre superadmin endre.

alter table public.pipe_tripletex_innstilling enable row level security;
alter table public.pipe_tripletex_kunde enable row level security;
alter table public.pipe_tripletex_ko enable row level security;

revoke all on public.pipe_tripletex_innstilling from public, anon, authenticated;
revoke all on public.pipe_tripletex_kunde from public, anon, authenticated;
revoke all on public.pipe_tripletex_ko from public, anon, authenticated;

grant select, update on public.pipe_tripletex_innstilling to authenticated;
grant select, delete on public.pipe_tripletex_kunde to authenticated;
grant select on public.pipe_tripletex_ko to authenticated;

drop policy if exists "tripletex innstilling les" on public.pipe_tripletex_innstilling;
create policy "tripletex innstilling les" on public.pipe_tripletex_innstilling
  for select to authenticated using (public.hm_er_kontor());

drop policy if exists "tripletex innstilling superadmin" on public.pipe_tripletex_innstilling;
create policy "tripletex innstilling superadmin" on public.pipe_tripletex_innstilling
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "tripletex kunde les" on public.pipe_tripletex_kunde;
create policy "tripletex kunde les" on public.pipe_tripletex_kunde
  for select to authenticated using (public.hm_er_kontor());

drop policy if exists "tripletex kunde fjern" on public.pipe_tripletex_kunde;
create policy "tripletex kunde fjern" on public.pipe_tripletex_kunde
  for delete to authenticated using (public.hm_er_kontor());

drop policy if exists "tripletex ko les" on public.pipe_tripletex_ko;
create policy "tripletex ko les" on public.pipe_tripletex_ko
  for select to authenticated using (public.hm_er_kontor());


-- ═══════════════════════════════════════════════════════════════════
--  Triggeren: nytt grunnlag → rad i køen, i same transaksjon
-- ═══════════════════════════════════════════════════════════════════
--
-- Berre ved INSERT. Grunnlaga som finst frå før, er førte inn i Tripletex for
-- hand og skal aldri sendast – dei er utanfor rekkjevidd same kva bryteren står på.
-- Lukkar nokon fana i sekundet etter, står rada som «venter» med ein Send-knapp.

create or replace function public.pipe_tripletex_ny_ko()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fra date;
begin
  select fra_dato into v_fra from public.pipe_tripletex_innstilling where id;
  if v_fra is not null and (new.created_at at time zone 'Europe/Oslo')::date >= v_fra then
    insert into public.pipe_tripletex_ko (invoice_id, grunnlag_nr)
    values (new.id, new.invoice_number)
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.pipe_tripletex_ny_ko() from public, anon, authenticated;

drop trigger if exists trg_pipe_tripletex_ny_ko on public.pipe_invoices;
create trigger trg_pipe_tripletex_ny_ko
  after insert on public.pipe_invoices
  for each row execute function public.pipe_tripletex_ny_ko();


-- ═══════════════════════════════════════════════════════════════════
--  Angre grunnlaget: hugs bestillingane FØR dei blir kopla frå
-- ═══════════════════════════════════════════════════════════════════
--
-- Som i 20260812090000, pluss éi oppdatering først. Ei rad som aldri kom til
-- Tripletex, blir sletta_grunnlag. Ei rad med ordre står som ho står: ordren
-- finst framleis i Tripletex, og det er eit menneske som rettar han der.

create or replace function public.pipe_delete_invoice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.hm_har_tilgang() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;

  update public.pipe_tripletex_ko
     set bestilling_ider = array(select o.id from public.pipe_orders o where o.invoice_id = p_id),
         status = case when status in ('venter', 'feilet', 'mangler_kunde') then 'sletta_grunnlag' else status end,
         endret = now()
   where invoice_id = p_id;

  update public.pipe_orders set invoice_id = null where invoice_id = p_id;
  delete from public.pipe_invoices where id = p_id;
end;
$$;

revoke all on function public.pipe_delete_invoice(uuid) from public, anon;
grant execute on function public.pipe_delete_invoice(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
--  Ta ei rad for sending (edge-funksjonen)
-- ═══════════════════════════════════════════════════════════════════
--
-- Svar (jsonb). «grunn» er det ein maskin les, aldri «melding»:
--   { grunn: "av" }                 fra_dato er NULL
--   { grunn: "ikke satt opp", melding }  produktnummer eller felleskunde manglar
--   { grunn: "ikke i koen" }        grunnlaget er for gammalt, eller laga mens det var av
--   { grunn: "alt sendt", ordre_id }
--   { grunn: "opptatt" }            eit anna kall sender det same no
--   { grunn: "ukjent" }             ordren KAN finnast. Sjå i Tripletex først
--   { grunn: "overlapp", grunnlag } bestillingane stod på eit angra grunnlag som
--                                   har (eller kan ha) ein ordre. Berre med p_overlapp_ok
--   { ko_id, grunnlag_nr, total, ... }  rada er teken (under_sending)

create or replace function public.pipe_tripletex_ta(
  p_invoice_id uuid,
  p_intern boolean default false,
  p_kunde_nokkel text default null,
  p_overlapp_ok boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.pipe_tripletex_innstilling;
  k public.pipe_tripletex_ko;
  inv public.pipe_invoices;
  v_ordrar uuid[];
  v_overlapp bigint[];
begin
  select * into s from public.pipe_tripletex_innstilling where id;
  if s.fra_dato is null then
    return jsonb_build_object('grunn', 'av');
  end if;
  if s.produkt_nr is null then
    return jsonb_build_object('grunn', 'ikke satt opp',
      'melding', 'Produktnummeret for Tripletex mangler under Innstillinger. Ingenting er sendt.');
  end if;
  if p_intern and s.felleskunde_nr is null then
    return jsonb_build_object('grunn', 'ikke satt opp',
      'melding', 'Felleskontoen for interne uttak mangler under Innstillinger. Ingenting er sendt.');
  end if;

  select * into k from public.pipe_tripletex_ko where invoice_id = p_invoice_id for update;
  if not found then
    return jsonb_build_object('grunn', 'ikke i koen');
  end if;

  if k.status = 'under_sending' then
    if k.endret < now() - interval '5 minutes' then
      -- Kallet døydde midt i. Det kan ha nådd Tripletex, så dette er ukjent, og
      -- det seier eit eige ord – ikkje ei setning.
      update public.pipe_tripletex_ko
         set status = 'ukjent_utfall',
             siste_feil = 'Et forsøk stoppet midt i. Ordren kan være opprettet: se i Tripletex.',
             endret = now()
       where id = k.id;
      return jsonb_build_object('grunn', 'ukjent');
    end if;
    return jsonb_build_object('grunn', 'opptatt');
  end if;
  if k.status in ('sendt', 'kontrollert') then
    return jsonb_build_object('grunn', 'alt sendt', 'ordre_id', k.tripletex_ordre_id);
  end if;
  if k.status = 'ukjent_utfall' then
    return jsonb_build_object('grunn', 'ukjent');
  end if;
  -- JA-LISTE: eit statusord ingen har bestemt seg for, blir aldri sendt
  if k.status not in ('venter', 'feilet', 'mangler_kunde') then
    return jsonb_build_object('grunn', 'feil', 'status', k.status);
  end if;

  select * into inv from public.pipe_invoices where id = p_invoice_id;
  select coalesce(array_agg(id), '{}') into v_ordrar from public.pipe_orders where invoice_id = p_invoice_id;

  if not p_overlapp_ok then
    select coalesce(array_agg(distinct g.grunnlag_nr order by g.grunnlag_nr), '{}') into v_overlapp
      from public.pipe_tripletex_ko g
     where g.invoice_id is null
       and g.status in ('sendt', 'kontrollert', 'ukjent_utfall', 'under_sending')
       and g.bestilling_ider && v_ordrar;
    if array_length(v_overlapp, 1) is not null then
      return jsonb_build_object('grunn', 'overlapp', 'grunnlag', to_jsonb(v_overlapp));
    end if;
  end if;

  update public.pipe_tripletex_ko
     set status = 'under_sending', forsok = forsok + 1, intern = coalesce(p_intern, false), endret = now()
   where id = k.id;

  return jsonb_build_object(
    'ko_id', k.id,
    'grunnlag_nr', inv.invoice_number,
    'total', inv.total,
    'periode_fra', inv.period_from,
    'periode_til', inv.period_to,
    'laget', (inv.created_at at time zone 'Europe/Oslo')::date,
    'notat', inv.note,
    'intern', coalesce(p_intern, false),
    -- Org.nr. frå bestillingane, berre siffer. Fleire enn eitt: kunden er ikkje eintydig
    'orgnr', (
      select coalesce(jsonb_agg(distinct n), '[]'::jsonb)
        from (
          select regexp_replace(o.org_number, '\D', '', 'g') as n
            from public.pipe_orders o
           where o.invoice_id = p_invoice_id and o.org_number is not null
        ) x
       where length(n) = 9
    ),
    'kundenr', case
      when coalesce(p_intern, false) then s.felleskunde_nr
      else (select kundenr from public.pipe_tripletex_kunde where kunde_nokkel = p_kunde_nokkel)
    end,
    'produkt_nr', s.produkt_nr,
    'forfall_dagar', s.forfall_dagar
  );
end;
$$;

revoke all on function public.pipe_tripletex_ta(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.pipe_tripletex_ta(uuid, boolean, text, boolean) to service_role;


-- ── Utfallet. Berre medan rada står som under_sending ──
--
-- Gir sant når rada blei skriven. Usant: ho stod ikkje lenger som under_sending
-- (eit anna kall tok over etter fem minutt), og ingenting er endra.

create or replace function public.pipe_tripletex_utfall(
  p_ko_id uuid,
  p_status text,
  p_ordre_id bigint default null,
  p_feil text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sendt', 'venter', 'mangler_kunde', 'feilet', 'ukjent_utfall') then
    raise exception 'Ukjent utfall: %', p_status;
  end if;
  if p_status = 'sendt' and (p_ordre_id is null or p_ordre_id <= 0) then
    raise exception 'Sendt krever ordre-id';
  end if;

  update public.pipe_tripletex_ko
     set status = p_status,
         tripletex_ordre_id = coalesce(p_ordre_id, tripletex_ordre_id),
         siste_feil = case when p_status = 'sendt' then null else left(p_feil, 500) end,
         endret = now()
   where id = p_ko_id and status = 'under_sending';
  return found;
end;
$$;

revoke all on function public.pipe_tripletex_utfall(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.pipe_tripletex_utfall(uuid, text, bigint, text) to service_role;


-- ── Ei kopling som har gitt ein ekte kunde i Tripletex ──

create or replace function public.pipe_tripletex_hugs_kunde(p_nokkel text, p_kundenr integer, p_av text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pipe_tripletex_kunde (kunde_nokkel, kundenr, koblet_av, koblet_at)
  values (p_nokkel, p_kundenr, left(p_av, 254), now())
  on conflict (kunde_nokkel) do update
    set kundenr = excluded.kundenr, koblet_av = excluded.koblet_av, koblet_at = now();
$$;

revoke all on function public.pipe_tripletex_hugs_kunde(text, integer, text) from public, anon, authenticated;
grant execute on function public.pipe_tripletex_hugs_kunde(text, integer, text) to service_role;


-- ═══════════════════════════════════════════════════════════════════
--  Vedlegget: PDF-en på ordren
-- ═══════════════════════════════════════════════════════════════════
--
--   { grunn: "av" | "ikke i koen" | "ingen ordre" | "alt lagt ved" | "opptatt" }
--   { grunn: "ukjent" }        PDF-en KAN liggje ved. Berre med p_overta
--   { ko_id, ordre_id, arva }  rada er teken (laster_opp). arva: eit tidlegare
--                              forsøk kan alt ha lagt ho ved

create or replace function public.pipe_tripletex_vedlegg_ta(p_invoice_id uuid, p_overta boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.pipe_tripletex_ko;
  v_arva boolean := false;
begin
  if (select fra_dato from public.pipe_tripletex_innstilling where id) is null then
    return jsonb_build_object('grunn', 'av');
  end if;

  select * into k from public.pipe_tripletex_ko where invoice_id = p_invoice_id for update;
  if not found then
    return jsonb_build_object('grunn', 'ikke i koen');
  end if;
  if k.tripletex_ordre_id is null or k.status not in ('sendt', 'kontrollert') then
    return jsonb_build_object('grunn', 'ingen ordre');
  end if;
  if k.vedlegg_status = 'lagt_ved' then
    return jsonb_build_object('grunn', 'alt lagt ved');
  end if;
  if k.vedlegg_status = 'laster_opp' and k.vedlegg_endret >= now() - interval '5 minutes' then
    return jsonb_build_object('grunn', 'opptatt');
  end if;
  if k.vedlegg_status in ('ukjent', 'laster_opp') then
    if not coalesce(p_overta, false) then
      return jsonb_build_object('grunn', 'ukjent');
    end if;
    v_arva := true;
  end if;

  update public.pipe_tripletex_ko
     set vedlegg_status = 'laster_opp',
         vedlegg_feil = case when v_arva
           then 'Et tidligere forsøk hadde ukjent utfall. PDF-en kan ligge to ganger på ordren: se i Tripletex.'
           else null end,
         vedlegg_endret = now()
   where id = k.id;

  return jsonb_build_object('ko_id', k.id, 'ordre_id', k.tripletex_ordre_id, 'arva', v_arva);
end;
$$;

revoke all on function public.pipe_tripletex_vedlegg_ta(uuid, boolean) from public, anon, authenticated;
grant execute on function public.pipe_tripletex_vedlegg_ta(uuid, boolean) to service_role;

create or replace function public.pipe_tripletex_vedlegg_utfall(p_ko_id uuid, p_status text, p_feil text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('lagt_ved', 'feilet', 'ukjent') then
    raise exception 'Ukjent utfall for vedlegget: %', p_status;
  end if;
  update public.pipe_tripletex_ko
     set vedlegg_status = p_status,
         -- Ein merknad om at det kan liggje to, blir ståande sjølv når det gjekk bra
         vedlegg_feil = case when p_status = 'lagt_ved' then vedlegg_feil else left(p_feil, 500) end,
         vedlegg_endret = now()
   where id = p_ko_id and vedlegg_status = 'laster_opp';
  return found;
end;
$$;

revoke all on function public.pipe_tripletex_vedlegg_utfall(uuid, text, text) from public, anon, authenticated;
grant execute on function public.pipe_tripletex_vedlegg_utfall(uuid, text, text) to service_role;


-- ═══════════════════════════════════════════════════════════════════
--  Vegen ut av «ukjent»: kontoret har sett i Tripletex
-- ═══════════════════════════════════════════════════════════════════
--
-- Fann ordren → kontrollert (låst for alltid; ordre-id-en er valfri, for
-- kontoret ser ordrenummeret, ikkje den interne id-en). Fann han ikkje → venter,
-- og Send blir mogleg att. Éi oppdatering med lovleg status i WHERE, så ho kan
-- ikkje kollidere med edge-funksjonen.

create or replace function public.pipe_tripletex_kontrollert(p_invoice_id uuid, p_fant boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_fant is null then
    raise exception 'Svar om ordren finnes i Tripletex';
  end if;

  update public.pipe_tripletex_ko
     set status = case when p_fant then 'kontrollert' else 'venter' end,
         kontrollert_av = coalesce(auth.jwt() ->> 'email', 'ukjent'),
         kontrollert_at = now(),
         endret = now()
   where invoice_id = p_invoice_id
     and (status = 'ukjent_utfall'
          or (status = 'under_sending' and endret < now() - interval '5 minutes'))
  returning status into v_status;

  if v_status is null then
    raise exception 'Grunnlaget venter ikke på kontroll i Tripletex. Last siden på nytt.';
  end if;
  return v_status;
end;
$$;

revoke all on function public.pipe_tripletex_kontrollert(uuid, boolean) from public, anon;
grant execute on function public.pipe_tripletex_kontrollert(uuid, boolean) to authenticated;
