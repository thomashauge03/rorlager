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
