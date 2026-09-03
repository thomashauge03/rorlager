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
