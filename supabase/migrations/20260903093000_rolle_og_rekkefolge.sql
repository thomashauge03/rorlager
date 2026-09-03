-- ═══════════════════════════════════════════════════════════
-- To feil funnet i gjennomgangen 3. september 2026.
-- ═══════════════════════════════════════════════════════════


-- ── 1. En rolle med tabulator var kontor ──
--
-- hm_er_kontor() spurte `btrim(lower(role)) <> 'prosjekt'`. Postgres `btrim()`
-- med standardargument fjerner BARE mellomrom — ikke tab, ikke linjeskift, ikke
-- hardt mellomrom. Så 'prosjekt' med en tab bak ble regnet som noe annet enn
-- 'prosjekt', altså som KONTOR, med full tilgang til fakturagrunnlag,
-- innkjøpspriser og lager.
--
-- Edge-funksjonen normaliserer med JS `.trim()`, som fjerner tab. Men det
-- forsvaret gjelder bare den ene veien inn. En rad lagt inn fra SQL Editor,
-- fra et importskript, eller fra en framtidig kodevei, ville ikke vært dekket.
-- Databasen skal ikke være avhengig av at klienten oppfører seg.
--
-- Skranken på system_users.role finnes ikke, og skal heller ikke legges til her:
-- den ville låst inn dagens fire rollenavn og veltet på en femte. Det er
-- SAMMENLIGNINGEN som skal tåle det den får.

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
       /*
        * HVITELISTE, IKKE «alt som ikke er prosjekt».
        *
        * Det negative vilkåret var feil vei. Først tålte det ikke tabulator,
        * så ikke hardt mellomrom — og selv etter at alt utenom a–z ble
        * strippet, ga en kyrillisk «о» i «prоsjekt» fortsatt KONTOR. Enhver
        * negativ formulering må kjenne hver eneste måte å skrive 'prosjekt'
        * på; en positiv trenger bare kjenne rollene som faktisk gir tilgang.
        *
        * Prisen er at en ny kontorrolle krever en migrasjon. Det er riktig
        * pris: en rolle ingen har tenkt på skal ikke gi tilgang til
        * fakturagrunnlag og innkjøpspriser fordi den tilfeldigvis ikke het
        * 'prosjekt'.
        */
       and regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g') in ('admin', 'kontor', 'lager')
  );
$$;

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
      -- NØYAKTIG samme normalisering som hm_er_kontor().
      --
      -- Klassene var ulike: `[^a-z]` her mot `[^a-z_]` der. En rolle med
      -- understrek — «pro_sjekt», «prosjekt_» — ga da hm_er_kontor()=usann i
      -- basen, mens klienten sammenlignet svaret mot «prosjekt», ikke fikk
      -- treff, og trodde han var kontor. Brukeren ble låst inne i et tomt
      -- adminpanel og kom aldri til prosjektet sitt.
      select regexp_replace(lower(role), '[^a-z]', '', 'g') from public.system_users
       where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       limit 1
    )
  end;
$$;

revoke all on function public.hm_er_kontor() from public, anon;
revoke all on function public.hm_rolle() from public, anon;
grant execute on function public.hm_er_kontor() to authenticated;
grant execute on function public.hm_rolle() to authenticated;


-- ── 2. Idempotenssjekken sto før tilgangssjekken ──
--
-- project_submit_receipt slo opp client_ref FØR den sjekket at den innloggede
-- er medlem av prosjektet, og returnerte hele kvitteringsraden hvis nøkkelen
-- fantes — navn, signatur og notat fra et prosjekt kalleren ikke er med på.
--
-- Praktisk vanskelig å utnytte: client_ref er en tilfeldig uuid som aldri
-- forlater nettleseren til den som lagde den. Men rekkefølgen er feil, og en
-- rekkefølge som er feil av tilfeldige grunner blir riktig av tilfeldige
-- grunner neste gang noen skriver om funksjonen.
--
-- Sjekken flyttes ned. Kroppen er ellers ordrett den samme.

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
  v_bilete integer := 0;
  v_grunn text;
begin
  /*
   * SAMME SVAR PÅ «finnes ikke» OG «ikke din».
   *
   * To ulike meldinger gjorde funksjonen til et orakel: en ikke-medlem fikk
   * «Fant ikke bestillingen» for en oppdiktet id, men «Ingen tilgang» for en
   * ekte — og kunne dermed bekrefte at en ordre-id finnes.
   *
   * Lav alvorlighet, siden uuid-er ikke lar seg gjette. Men et orakel er
   * gratis å fjerne, og den som gjetter riktig skal ikke få vite det.
   */
  select * into v_order from public.project_orders where id = p_order_id;
  if not found or not public.hm_er_prosjektmedlem(v_order.project_id) then
    raise exception 'Fant ikke bestillingen' using errcode = '42501';
  end if;

  -- Same nøkkel to gonger = same mottak. Sjå 20260903090100.
  if p_client_ref is not null then
    select * into v_receipt from public.project_receipts
     where client_ref = p_client_ref and order_id = p_order_id;
    if found then
      return v_receipt;
    end if;
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

  v_grunn := nullif(trim(coalesce(p_no_photo_reason, '')), '');

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
    if v_bilde is null then
      raise exception 'Tom bildesti';
    end if;

    /*
     * HELE stien må ha rett form, ikke bare begynne riktig.
     *
     * En ren prefikssjekk godtok «<prosjekt>/../<annet-prosjekt>/x.jpg». Det
     * brøt ingenting i dag, fordi Storage lagrer nøkkelen bokstavelig og
     * policyen leser samme første ledd — men vakta LESER som en prefikssjekk
     * uten å være det, og den dagen noe normaliserer stien (en S3-klient, et
     * ryddeskript) blir det en traversering.
     */
    if v_bilde !~ ('^' || v_order.project_id::text || '/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$') then
      raise exception 'Bildet hører ikke til dette prosjektet';
    end if;

    /*
     * FILA MÅ FAKTISK FINNES.
     *
     * Kravet talte tidligere bare elementer i et array, og løkka sjekket bare
     * teksten. En klient som ville slippe unna bildekravet trengte ikke laste
     * opp noe i det hele tatt — det holdt å dikte opp en sti.
     */
    if not exists (
      select 1 from storage.objects
       where bucket_id = 'mottak-bilder' and name = v_bilde
    ) then
      raise exception 'Fant ikke bildet. Prøv å laste det opp på nytt.';
    end if;

    insert into public.project_receipt_photos (receipt_id, path)
    values (v_receipt.id, v_bilde)
    on conflict (path) do nothing;

    /*
     * BARE RADER SOM FAKTISK BLEI SKRIVNE.
     *
     * `on conflict do nothing` set FOUND til usann når rada alt fanst. Utan
     * denne sjekken talde løkka FORSØK, og eit mottak som sende ein sti ein
     * annan alt hadde brukt enda opp med null bilete og null grunn — altså
     * nøyaktig den invarianten kravet skulle halde oppe.
     */
    if found then
      v_bilete := v_bilete + 1;
    end if;
  end loop;

  /*
   * Etter løkka, ikke før.
   *
   * `on conflict do nothing` gjorde at et mottak som sendte en sti som allerede
   * var brukt, endte med NULL bilder og NULL grunn — invarianten «enten bilde
   * eller grunn» holdt ikke. Nå telles det som faktisk ble skrevet.
   */
  if v_bilete = 0 and v_grunn is null then
    raise exception 'Legg ved minst ett bilde, eller skriv hvorfor det ikke lot seg gjøre';
  end if;

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


-- ── 3. Et avsluttet prosjekt tar ikke imot nye behov ──
--
-- project_submit_request sjekket bare medlemskap, ikke status. Byggeplasslista
-- viste heller ingen forskjell på et aktivt og et avsluttet prosjekt — de sto
-- bare lenger ned. Formannen scroller, ser et prosjekt som ser helt normalt ut,
-- melder inn tolv varer, og de blir bestilt til en ferdig jobb.
--
-- Merket i grensesnittet er rettet samtidig, men det er dette som er vakta:
-- lista kan alltid være foreldet i det trykket skjer.

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
  v_status text;
begin
  if not public.hm_er_prosjektmedlem(p_project_id) then
    raise exception 'Ingen tilgang til dette prosjektet' using errcode = '42501';
  end if;

  select status into v_status from public.projects where id = p_project_id;
  if not found then
    raise exception 'Fant ikke prosjektet';
  end if;
  if v_status <> 'aktiv' then
    raise exception 'Prosjektet er avsluttet. Ta kontakt med kontoret.';
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


-- ── 4. project_recompute_status var åpen for alle innloggede ──
--
-- Den er SECURITY DEFINER, hadde `grant execute ... to authenticated`, og —
-- i motsetning til hver eneste andre prosjekt-RPC — ingen vakt i kroppen.
--
-- Demonstrert av en angriper: en innlogget bruker UTEN medlemskap i noe
-- prosjekt kunne lese statusen på en hvilken som helst bestilling, bruke
-- feilmeldingen som orakel på om en ordre-id finnes, og — fordi funksjonen
-- kjører som eier og går utenom RLS — flytte et fremmed prosjekts bestilling
-- fra 'bestilt' til 'mottatt'.
--
-- Funksjonen blir bare kalt internt, med `perform`, fra project_mark_ordered og
-- project_submit_receipt. Begge er SECURITY DEFINER og kjører som eier, som har
-- kjøreretten uansett. Den skal aldri ha vært kallbar utenfra.
--
-- Samme klasse tabbe som pipe_import_costs var i august: en definer-funksjon
-- som gikk under radaren da vaktene ble satt.

revoke execute on function public.project_recompute_status(uuid) from public, anon, authenticated;


-- ── 5. Sekvensene lakk forretningsvolum til alle innloggede ──
--
-- Herdingen i 20260903090200 stengte bare anon, med begrunnelsen at «select på
-- en sekvens røper hvor mange ordrer bedriften har hatt». Nøyaktig den samme
-- lekkasjen sto åpen for `authenticated` — som i denne modellen inkluderer
-- byggeplassbrukerne hele prosjekt-tilgangsmodellen ble bygd for å gjerde inne.
--
-- `usage` blir stående: kontoret setter inn direkte i projects og
-- project_orders, og trenger nextval. Hull i serien er uansett uttrykkelig
-- greit ifølge init-migrasjonen — det er `select last_value` som er problemet.

revoke select on sequence public.projects_project_number_seq         from authenticated;
revoke select on sequence public.project_orders_order_number_seq     from authenticated;
revoke select on sequence public.project_receipts_receipt_number_seq from authenticated;
revoke select on sequence public.pipe_orders_order_number_seq        from authenticated;
revoke select on sequence public.pipe_invoices_invoice_number_seq    from authenticated;


-- ── 6. Fakturabeløpet regnes i basen ──
--
-- `pipe_create_invoice` lagret `p_total` slik den kom inn fra nettleseren, og
-- sammenlignet den aldri med bestillingene den knyttet til.
--
-- Kontrasten er skarp: hele uttaksdelen henter prisene fra basen NETTOPP for at
-- klienten ikke skal bestemme dem — «En kunde som endrer prisen i nettleseren
-- endrer ingenting», står det i init-migrasjonen. Men beløpet Hauge Maskin
-- faktisk fakturerer ble regnet ut i en utestet useMemo og lagret ordrett.
--
-- Konkret hva det kostet: linjer uten pris utelates fra summen i grensesnittet.
-- En katalogvare som har mistet prisen sin reduserte altså stille det som ble
-- fakturert, og ingen kunne se det.
--
-- Krever kontortilgang, så det er ikke et hull utad. Men det er ett tall som
-- ikke stemmer med et annet, og det er tallet som går til kunden.
--
-- I tillegg: en ukjent ordre-id ble ikke avvist. Et grunnlag på bestillinger
-- som ikke finnes ble opprettet, tomt, med beløpet klienten oppga.

CREATE OR REPLACE FUNCTION public.pipe_create_invoice(
  p_customer_name text,
  p_period_from date,
  p_period_to date,
  p_order_ids uuid[],
  p_total numeric,
  p_note text DEFAULT NULL::text
)
 RETURNS pipe_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invoice public.pipe_invoices;
  v_already int;
  v_finnes int;
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

  -- Alle id-ene må peke på noe. Ellers blir grunnlaget tomt uten å si fra.
  select count(*) into v_finnes from public.pipe_orders where id = any(p_order_ids);
  if v_finnes <> array_length(p_order_ids, 1) then
    raise exception 'Fant ikke alle bestillingene. Last siden på nytt.';
  end if;

  -- Ei bestilling skal aldri hamne på to grunnlag. Sjekken ligg her og ikkje
  -- berre i grensesnittet, i tilfelle to faner blir brukte samtidig.
  select count(*) into v_already
  from public.pipe_orders
  where id = any(p_order_ids) and invoice_id is not null;

  if v_already > 0 then
    raise exception '% av bestillingene er allerede fakturert', v_already;
  end if;

  -- Beløpet kommer HERFRA, ikke fra klienten. p_total blir stående i
  -- signaturen så eldre klienter ikke feiler, men verdien blir ikke brukt.
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
$function$;


-- ── 5. Storage-policyene: trygg cast, og opprydding som virker ──
--
-- TO FEIL:
--
-- (a) `((storage.foldername(name))[1])::uuid` KASTER på et navn der første ledd
--     ikke er en uuid. Ligger det først én slik rad i bøtta — lagt inn av
--     service_role, eller av en mappe laget fra Supabase-dashbordet, som får en
--     `.emptyFolderPlaceholder` — så feiler HVER select mot storage.objects som
--     rører den raden, for alle innloggede. Da stopper miniatyrer, signerte
--     lenker og bildene i PDF-en for alle prosjekter samtidig.
--
--     Regexen foran casten gjør at en slik rad bare ikke matcher, i stedet for
--     å velte spørringen.
--
-- (b) Sletting var kontorets alene. Det er riktig for dokumentasjon som er
--     kvittert for — plassen skal ikke kunne fjerne bevis i ettertid. Men det
--     gjaldt også bildene han nettopp lastet opp og ikke har kvittert for ennå:
--     trykket han på søppelbøtta, forsvant miniatyren fra skjermen mens fila
--     ble liggende. Han trodde den var borte. Den lå der, lesbar for alle på
--     prosjektet.
--
--     Nå kan et prosjektmedlem slette en fil under sitt eget prosjekt SÅ LENGE
--     ingen kvittering peker på den. I det mottaket er registrert, er den
--     kontorets.

do $$
begin
  drop policy if exists "mottaksbilde les" on storage.objects;
  create policy "mottaksbilde les" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'mottak-bilder'
      -- Uuid-FORMEN, ikke bare 36 tegn fra riktig alfabet. «000…0» (36 nuller)
      -- og 36 bindestreker matchet den forrige regexen, kastet på casten, og
      -- ville fått hver select mot bøtta til å feile for alle innloggede.
      and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      and public.hm_er_prosjektmedlem(((storage.foldername(name))[1])::uuid)
    );

  drop policy if exists "mottaksbilde skriv" on storage.objects;
  create policy "mottaksbilde skriv" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'mottak-bilder'
      and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'
      and public.hm_er_prosjektmedlem(((storage.foldername(name))[1])::uuid)
    );

  drop policy if exists "mottaksbilde slett" on storage.objects;
  create policy "mottaksbilde slett" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'mottak-bilder'
      and (
        public.hm_er_kontor()
        or (
          name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
          and public.hm_er_prosjektmedlem(((storage.foldername(name))[1])::uuid)
          /*
           * SITT EGET bilde, ikke hvem som helst sitt på prosjektet.
           *
           * Uten eiersjekken kunne Per slette Karis uferdige opplasting. Og
           * siden RPC-en nå krever at fila finnes, ville hennes kvittering
           * feilet med «Fant ikke bildet» — en annens sletting blokkerte
           * altså hennes mottak. Før eksistenskravet var følgen bare at fila
           * ble liggende; nå er den verre.
           */
          and owner = auth.uid()
          -- Bare det som ennå ikke er dokumentasjon
          and not exists (
            select 1 from public.project_receipt_photos ph where ph.path = storage.objects.name
          )
        )
      )
    );

exception when insufficient_privilege or wrong_object_type then
  raise warning 'Fikk ikke oppdatert policyene på storage.objects (%). Se README under «Bilde i mottakskontrollen».', sqlerrm;
end $$;
