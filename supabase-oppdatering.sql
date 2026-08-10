-- ============================================================================
--  RØRLAGER – oppdatering 10.08.26
--
--  Kjør denne hvis du allerede har kjørt supabase-setup.sql én gang.
--    1. Fakturagrunnlaget slutter å flytte bestillinger fra Ny til Behandlet
--    2. markup_percent + funksjon som regner ut priser fra avanse
--    3. Bytter ut demokatalogen med prislisten fra Brødrene Dahl (156 varer)
--    4. Funksjon for import av prisliste fra Excel
--
--  ADVARSEL: punkt 3 sletter alle varer og varegrupper som ligger der nå.
--  Bestillinger beholder navn og pris på linjene sine.
-- ============================================================================

-- >>> 20260810110000_invoice_keeps_status.sql <<<

-- Fakturagrunnlaget skal ikkje flytte statusen pÃ¥ bestillingane.
--
-- Den fÃ¸rste utgÃ¥va sette status = 'behandlet' pÃ¥ alle uttak med status 'ny' nÃ¥r
-- eit grunnlag blei laga. Det var feil av to grunnar: Ã¥ fakturere og Ã¥ ekspedere
-- er to ulike ting, og angre-knappen kunne ikkje setje statusen tilbake â€“ han
-- veit ikkje kva han var fÃ¸r. Resultatet var ei stille endring som ikkje lÃ©t seg
-- reversere.
--
-- No rÃ¸rer grunnlaget berre invoice_id, som er nettopp det angre-knappen kan
-- nullstille. Status blir styrt der han hÃ¸yrer heime: i bestillingslista.

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
    raise exception 'BÃ¥de fra- og til-dato mÃ¥ fylles ut';
  end if;

  -- Ei bestilling skal aldri hamne pÃ¥ to grunnlag. Sjekken ligg her og ikkje
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


-- >>> 20260810120000_avanse.sql <<<

-- Avanse: pÃ¥slaget frÃ¥ innkjÃ¸pspris til salspris.
--
-- Prislista frÃ¥ grossisten er netto innkjÃ¸pspris. Salsprisen er den same
-- rekneoperasjonen pÃ¥ kvar einaste vare, og skal difor styrast eitt sted i
-- staden for Ã¥ tastast inn 156 gonger.
--
-- Prisen blir REKNA UT OG LAGRA, ikkje utleidd ved lesing. Det er med vilje:
-- pipe_submit_order slÃ¥r opp prisen i pipe_types nÃ¥r ei bestilling kjem inn, og
-- ei ordrelinje skal for alltid vise prisen som gjaldt den dagen. Blei prisen
-- rekna ut pÃ¥ nytt ved kvar visning, ville gamle bestillingar endra seg kvar
-- gong pÃ¥slaget blei justert.

alter table public.pipe_settings
  add column if not exists markup_percent numeric not null default 25;

comment on column public.pipe_settings.markup_percent is
  'Standard pÃ¥slag i prosent frÃ¥ cost_price til price. Brukt av pipe_apply_markup.';

-- ============================================================================
--  Rekn ut prisane pÃ¥ nytt
--
--  p_percent      pÃ¥slag i prosent (25 = 25 % pÃ¥ innkjÃ¸psprisen)
--  p_category_id  avgrens til Ã©i varegruppe, null = alle
--  p_pipe_type_ids avgrens til utvalde varer, null = alle
--  p_round_to     rund av til nÃ¦rmaste (1 = heile kroner, 0.01 = Ã¸re)
--
--  Returnerer talet pÃ¥ varer som fekk ny pris.
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
    raise exception 'PÃ¥slaget mÃ¥ vÃ¦re null eller hÃ¸yere';
  end if;
  if p_percent > 1000 then
    raise exception 'PÃ¥slaget er urimelig hÃ¸yt';
  end if;

  -- Avrunding til 0 ville gitt divisjon pÃ¥ null lenger nede
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

-- Kor mange varer som manglar innkjÃ¸pspris, og difor ikkje blir med pÃ¥
-- utrekninga. Grensesnittet mÃ¥ kunne seie frÃ¥ om det i staden for Ã¥ la dei
-- stÃ¥ att med gammal pris utan forklaring.
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


-- >>> 20260810120100_katalog_dahl.sql <<<

-- Varekatalog frÃ¥ prislista til BrÃ¸drene Dahl (tilbod 94587, revidert 10.08.26).
--
-- Prisane i lista er NETTO innkjÃ¸pspris eks. mva. Dei blir lagde inn som
-- cost_price, og salsprisen er rekna ut med pÃ¥slaget under. PÃ¥slaget ligg Ã²g i
-- pipe_settings, slik at det kan endrast eitt sted seinare â€“ sjÃ¥ prisjusteringa
-- i adminpanelet.
--
-- Demokatalogen frÃ¥ oppstarten blir fjerna. Bestillingar som alt peikar pÃ¥ dei
-- gamle varene beheld namn og pris pÃ¥ linjene sine; det er berre peikaren som
-- forsvinn, og det er med vilje: historikken skal ikkje endre seg.

-- StartpÃ¥slag: 25 %
update public.pipe_settings set markup_percent = 25 where id = 1;

delete from public.pipe_types;
delete from public.pipe_categories;

insert into public.pipe_categories (name, color, sort_order) values
  ('OvervannsrÃ¸r', '#2f6f9f', 1),
  ('AvlÃ¸psrÃ¸r', '#5b6b7a', 2),
  ('DrensrÃ¸r', '#6b8f3a', 3),
  ('PE trykkrÃ¸r', '#1f2933', 4),
  ('Deler overvann', '#3f8fbf', 5),
  ('Deler avlÃ¸p', '#8a7a5a', 6),
  ('PE-deler', '#4a4a4a', 7),
  ('Koblinger og kraner', '#a67c00', 8);

-- OvervannsrÃ¸r (18 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '100 mm', '3100501', 'overvannsror-x-stream-sn8-100-mm', 'm', 66.7, 83.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '150 mm', '3100502', 'overvannsror-x-stream-sn8-150-mm', 'm', 120.4, 150.5, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '200 mm', '3100504', 'overvannsror-x-stream-sn8-200-mm', 'm', 195.4, 244.25, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '250 mm', '3100506', 'overvannsror-x-stream-sn8-250-mm', 'm', 297.3, 371.63, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '300 mm', '3100508', 'overvannsror-x-stream-sn8-300-mm', 'm', 405.7, 507.13, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '400 mm', '3100511', 'overvannsror-x-stream-sn8-400-mm', 'm', 707.8, 884.75, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '500 mm', '3100513', 'overvannsror-x-stream-sn8-500-mm', 'm', 1307.5, 1634.38, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r X-Stream SN8', '600 mm', '3100515', 'overvannsror-x-stream-sn8-600-mm', 'm', 1418.8, 1773.5, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '200/225 mm', '3012422', 'overvannsror-iq-sn8-200-225-mm', 'm', 214.3, 267.88, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '300/338 mm', '3012426', 'overvannsror-iq-sn8-300-338-mm', 'm', 396.1, 495.13, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '400/450 mm', '3012428', 'overvannsror-iq-sn8-400-450-mm', 'm', 644, 805, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '500/560 mm', '3012431', 'overvannsror-iq-sn8-500-560-mm', 'm', 1138.1, 1422.63, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '600/684 mm', '3012433', 'overvannsror-iq-sn8-600-684-mm', 'm', 1380.8, 1726, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '800/902 mm', '3012436', 'overvannsror-iq-sn8-800-902-mm', 'm', 2736.3, 3420.38, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r IQ SN8', '1000/1154 mm', '3012439', 'overvannsror-iq-sn8-1000-1154-mm', 'm', 6528, 8160, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r PVC glatt', '110 mm', '2295601', 'overvannsror-pvc-glatt-110-mm', 'm', 63.7, 79.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r PVC glatt', '160 mm', '2295603', 'overvannsror-pvc-glatt-160-mm', 'm', 148.2, 185.25, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'OvervannsrÃ¸r'), 'OvervannsrÃ¸r PVC glatt', '200 mm', '2295604', 'overvannsror-pvc-glatt-200-mm', 'm', 190.8, 238.5, 0, 0, 18);

-- AvlÃ¸psrÃ¸r (3 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'AvlÃ¸psrÃ¸r'), 'AvlÃ¸psrÃ¸r PVC', '110 mm', '2251059', 'avlopsror-pvc-110-mm', 'm', 63.7, 79.63, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'AvlÃ¸psrÃ¸r'), 'AvlÃ¸psrÃ¸r PVC', '160 mm', '2251119', 'avlopsror-pvc-160-mm', 'm', 148.5, 185.63, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'AvlÃ¸psrÃ¸r'), 'AvlÃ¸psrÃ¸r PVC', '200 mm', '2251159', 'avlopsror-pvc-200-mm', 'm', 190.1, 237.63, 0, 0, 3);

-- DrensrÃ¸r (4 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'DrensrÃ¸r'), 'DrensrÃ¸r PE korrugert', '110 mm', '1381970', 'drensror-pe-korrugert-110-mm', 'm', 49.1, 61.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'DrensrÃ¸r'), 'DrensrÃ¸r PE korrugert', '160 mm', '1381971', 'drensror-pe-korrugert-160-mm', 'm', 124.5, 155.63, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'DrensrÃ¸r'), 'DrensrÃ¸r uten slisser', '83/100 mm', '3104919', 'drensror-uten-slisser-83-100-mm', 'm', 25.5, 31.88, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'DrensrÃ¸r'), 'DrensrÃ¸r korrugert PEH', '83/100 mm', '3104629', 'drensror-korrugert-peh-83-100-mm', 'm', 21.76, 27.2, 0, 0, 4);

-- PE trykkrÃ¸r (12 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 300 m)', '20 mm', '2392757', 'pe100-sdr11-trykkror-kveil-300-m-20-mm', 'm', 13.1, 16.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 50 m)', '20 mm', '2392743', 'pe100-sdr11-trykkror-kveil-50-m-20-mm', 'm', 14.6, 18.25, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 300 m)', '25 mm', '2392758', 'pe100-sdr11-trykkror-kveil-300-m-25-mm', 'm', 14.2, 17.75, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 50 m)', '25 mm', '2392746', 'pe100-sdr11-trykkror-kveil-50-m-25-mm', 'm', 16, 20, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 300 m)', '32 mm', '2392759', 'pe100-sdr11-trykkror-kveil-300-m-32-mm', 'm', 19.4, 24.25, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 50 m)', '32 mm', '2392749', 'pe100-sdr11-trykkror-kveil-50-m-32-mm', 'm', 23, 28.75, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 150 m)', '40 mm', '2392761', 'pe100-sdr11-trykkror-kveil-150-m-40-mm', 'm', 36.5, 45.63, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 50 m)', '40 mm', '2392752', 'pe100-sdr11-trykkror-kveil-50-m-40-mm', 'm', 36.3, 45.38, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 150 m)', '50 mm', '2392762', 'pe100-sdr11-trykkror-kveil-150-m-50-mm', 'm', 54.9, 68.63, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 50 m)', '50 mm', '2392753', 'pe100-sdr11-trykkror-kveil-50-m-50-mm', 'm', 57.4, 71.75, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 150 m)', '63 mm', '2392764', 'pe100-sdr11-trykkror-kveil-150-m-63-mm', 'm', 80.6, 100.75, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'PE trykkrÃ¸r'), 'PE100 SDR11 trykkrÃ¸r (kveil 50 m)', '63 mm', '2392763', 'pe100-sdr11-trykkror-kveil-50-m-63-mm', 'm', 122.5, 153.13, 0, 0, 12);

-- Deler overvann (20 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15Â°', '150 mm', '3100544', 'bend-x-stream-15gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30Â°', '150 mm', '3100545', 'bend-x-stream-30gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45Â°', '150 mm', '3100546', 'bend-x-stream-45gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90Â°', '150 mm', '3100547', 'bend-x-stream-90gr-150-mm', 'stk', 327, 408.75, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '150 mm', '3100652', 'dobbeltmuffe-x-stream-150-mm', 'stk', 153.7, 192.13, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15Â°', '200 mm', '3100548', 'bend-x-stream-15gr-200-mm', 'stk', 370, 462.5, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30Â°', '200 mm', '3100549', 'bend-x-stream-30gr-200-mm', 'stk', 368.8, 461, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45Â°', '200 mm', '3100551', 'bend-x-stream-45gr-200-mm', 'stk', 368.8, 461, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90Â°', '200 mm', '3100552', 'bend-x-stream-90gr-200-mm', 'stk', 570, 712.5, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '200 mm', '3100653', 'dobbeltmuffe-x-stream-200-mm', 'stk', 216.3, 270.38, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15Â°', '250 mm', '3100553', 'bend-x-stream-15gr-250-mm', 'stk', 1202.4, 1503, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30Â°', '250 mm', '3100554', 'bend-x-stream-30gr-250-mm', 'stk', 1202.4, 1503, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45Â°', '250 mm', '3100555', 'bend-x-stream-45gr-250-mm', 'stk', 1205.1, 1506.38, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90Â°', '250 mm', '3100556', 'bend-x-stream-90gr-250-mm', 'stk', 1701, 2126.25, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '250 mm', '3100654', 'dobbeltmuffe-x-stream-250-mm', 'stk', 454.5, 568.13, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15Â°', '300 mm', '3100557', 'bend-x-stream-15gr-300-mm', 'stk', 1863.5, 2329.38, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30Â°', '300 mm', '3100558', 'bend-x-stream-30gr-300-mm', 'stk', 1863.5, 2329.38, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45Â°', '300 mm', '3100559', 'bend-x-stream-45gr-300-mm', 'stk', 1865, 2331.25, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90Â°', '300 mm', '3100561', 'bend-x-stream-90gr-300-mm', 'stk', 2613, 3266.25, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '300 mm', '3100655', 'dobbeltmuffe-x-stream-300-mm', 'stk', 510.4, 638, 0, 0, 20);

-- Deler avlÃ¸p (36 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 15Â°', '110 mm', '2252254', 'bend-grunnavlop-15gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 30Â°', '110 mm', '2252264', 'bend-grunnavlop-30gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 45Â°', '110 mm', '2252269', 'bend-grunnavlop-45gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 90Â°', '110 mm', '2252279', 'bend-grunnavlop-90gr-110-mm', 'stk', 39, 48.75, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 15Â°', '160 mm', '2252374', 'bend-grunnavlop-15gr-160-mm', 'stk', 108.4, 135.5, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 30Â°', '160 mm', '2252384', 'bend-grunnavlop-30gr-160-mm', 'stk', 121.9, 152.38, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 45Â°', '160 mm', '2252389', 'bend-grunnavlop-45gr-160-mm', 'stk', 121.9, 152.38, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 90Â°', '160 mm', '2252394', 'bend-grunnavlop-90gr-160-mm', 'stk', 205.5, 256.88, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 15Â°', '200 mm', '2252409', 'bend-grunnavlop-15gr-200-mm', 'stk', 251.7, 314.63, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 30Â°', '200 mm', '2252419', 'bend-grunnavlop-30gr-200-mm', 'stk', 260.3, 325.38, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 45Â°', '200 mm', '2252424', 'bend-grunnavlop-45gr-200-mm', 'stk', 260.5, 325.63, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend grunnavlÃ¸p 90Â°', '200 mm', '2252434', 'bend-grunnavlop-90gr-200-mm', 'stk', 472.5, 590.63, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'GrenrÃ¸r grunnavlÃ¸p', '110 mm', '2253014', 'grenror-grunnavlop-110-mm', 'stk', 65.4, 81.75, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'GrenrÃ¸r grunnavlÃ¸p', '160X110 mm', '2253044', 'grenror-grunnavlop-160x110-mm', 'stk', 118.4, 148, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'GrenrÃ¸r grunnavlÃ¸p', '160 mm', '2253054', 'grenror-grunnavlop-160-mm', 'stk', 175.4, 219.25, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'GrenrÃ¸r grunnavlÃ¸p 45Â°', '200X110 mm', '2253084', 'grenror-grunnavlop-45gr-200x110-mm', 'stk', 327.7, 409.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'GrenrÃ¸r grunnavlÃ¸p', '200X160 mm', '2253094', 'grenror-grunnavlop-200x160-mm', 'stk', 309.9, 387.38, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'LÃ¸pemuffe grunnavlÃ¸p', '110 mm', '2255209', 'lopemuffe-grunnavlop-110-mm', 'stk', 36.1, 45.13, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'LÃ¸pemuffe grunnavlÃ¸p', '160 mm', '2255224', 'lopemuffe-grunnavlop-160-mm', 'stk', 85.9, 107.38, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'LÃ¸pemuffe grunnavlÃ¸p', '200 mm', '2255234', 'lopemuffe-grunnavlop-200-mm', 'stk', 172.2, 215.25, 0, 0, 20),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Dobbelmuffe grunnavlÃ¸p', '110 mm', '2255009', 'dobbelmuffe-grunnavlop-110-mm', 'stk', 36.3, 45.38, 0, 0, 21),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Dobbelmuffe grunnavlÃ¸p', '160 mm', '2255024', 'dobbelmuffe-grunnavlop-160-mm', 'stk', 85.9, 107.38, 0, 0, 22),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Dobbelmuffe grunnavlÃ¸p', '200 mm', '2255034', 'dobbelmuffe-grunnavlop-200-mm', 'stk', 172.2, 215.25, 0, 0, 23),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Ters grunnavlÃ¸p', '110 mm', '2254709', 'ters-grunnavlop-110-mm', 'stk', 37.6, 47, 0, 0, 24),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Ters grunnavlÃ¸p', '160 mm', '2254724', 'ters-grunnavlop-160-mm', 'stk', 62.9, 78.63, 0, 0, 25),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Ters grunnavlÃ¸p', '200 mm', '2254734', 'ters-grunnavlop-200-mm', 'stk', 101.8, 127.25, 0, 0, 26),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 11Â°', '160 mm', '2251669', 'bend-langt-avlop-11gr-160-mm', 'stk', 691, 863.75, 0, 0, 27),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 22Â°', '160 mm', '2251679', 'bend-langt-avlop-22gr-160-mm', 'stk', 691, 863.75, 0, 0, 28),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 30Â°', '160 mm', '2251684', 'bend-langt-avlop-30gr-160-mm', 'stk', 691, 863.75, 0, 0, 29),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 45Â°', '160 mm', '2251689', 'bend-langt-avlop-45gr-160-mm', 'stk', 691, 863.75, 0, 0, 30),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 11Â°', '200 mm', '2251749', 'bend-langt-avlop-11gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 31),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 22Â°', '200 mm', '2251759', 'bend-langt-avlop-22gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 32),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 30Â°', '200 mm', '2251764', 'bend-langt-avlop-30gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 33),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Bend langt avlÃ¸p 45Â°', '200 mm', '2251769', 'bend-langt-avlop-45gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 34),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Stake- og spylegren PP', '110/200 mm', '3210046', 'stake-og-spylegren-pp-110-200-mm', 'stk', 546.5, 683.13, 0, 0, 35),
  ((select id from public.pipe_categories where name = 'Deler avlÃ¸p'), 'Stake- og spylegren PP', '160/200 mm', '3210047', 'stake-og-spylegren-pp-160-200-mm', 'stk', 746.8, 933.5, 0, 0, 36);

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
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '32 mm', '2265571', 'elektroalbue-pe100-90gr-32-mm', 'stk', 88.74, 110.93, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '40 mm', '2265572', 'elektroalbue-pe100-90gr-40-mm', 'stk', 108.8, 136, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '50 mm', '2265573', 'elektroalbue-pe100-90gr-50-mm', 'stk', 140.76, 175.95, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '63 mm', '2265574', 'elektroalbue-pe100-90gr-63-mm', 'stk', 158.44, 198.05, 0, 0, 20),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '75 mm', '2265575', 'elektroalbue-pe100-90gr-75-mm', 'stk', 251.6, 314.5, 0, 0, 21),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '90 mm', '2265576', 'elektroalbue-pe100-90gr-90-mm', 'stk', 287.3, 359.13, 0, 0, 22),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '110 mm', '2265577', 'elektroalbue-pe100-90gr-110-mm', 'stk', 404.6, 505.75, 0, 0, 23),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '125 mm', '2265578', 'elektroalbue-pe100-90gr-125-mm', 'stk', 579.7, 724.63, 0, 0, 24),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90Â°', '160 mm', '2265579', 'elektroalbue-pe100-90gr-160-mm', 'stk', 965.6, 1207, 0, 0, 25),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '32 mm', '2265581', 'elektroalbue-pe100-45gr-32-mm', 'stk', 89.76, 112.2, 0, 0, 26),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '40 mm', '2265582', 'elektroalbue-pe100-45gr-40-mm', 'stk', 107.78, 134.73, 0, 0, 27),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '50 mm', '2265583', 'elektroalbue-pe100-45gr-50-mm', 'stk', 141.78, 177.23, 0, 0, 28),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '63 mm', '2265584', 'elektroalbue-pe100-45gr-63-mm', 'stk', 158.78, 198.48, 0, 0, 29),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '75 mm', '2265585', 'elektroalbue-pe100-45gr-75-mm', 'stk', 273.7, 342.13, 0, 0, 30),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '90 mm', '2265586', 'elektroalbue-pe100-45gr-90-mm', 'stk', 287.3, 359.13, 0, 0, 31),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '110 mm', '2265587', 'elektroalbue-pe100-45gr-110-mm', 'stk', 406.3, 507.88, 0, 0, 32),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '125 mm', '2265588', 'elektroalbue-pe100-45gr-125-mm', 'stk', 578, 722.5, 0, 0, 33),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45Â°', '160 mm', '2265589', 'elektroalbue-pe100-45gr-160-mm', 'stk', 965.6, 1207, 0, 0, 34),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rÃ¸r elektro PE100 90Â°', '32 mm', '2462163', 't-ror-elektro-pe100-90gr-32-mm', 'stk', 117.64, 147.05, 0, 0, 35),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rÃ¸r elektro PE100 90Â°', '40 mm', '2462165', 't-ror-elektro-pe100-90gr-40-mm', 'stk', 135.66, 169.58, 0, 0, 36),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rÃ¸r elektro PE100 90Â°', '50 mm', '2462167', 't-ror-elektro-pe100-90gr-50-mm', 'stk', 173.4, 216.75, 0, 0, 37),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rÃ¸r elektro PE100 90Â°', '63 mm', '2462169', 't-ror-elektro-pe100-90gr-63-mm', 'stk', 197.2, 246.5, 0, 0, 38),
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
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo Ã— 3/4"', '25 mm', '2561429', 'tippunion-isiflo-3-4-25-mm', 'stk', 153.8, 192.25, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo Ã— 1"', '32 mm', '2561434', 'tippunion-isiflo-1-32-mm', 'stk', 170.1, 212.63, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo Ã— 1.1/4"', '40 mm', '2561439', 'tippunion-isiflo-1-1-4-40-mm', 'stk', 306.7, 383.38, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo Ã— 1.1/2"', '50 mm', '2561444', 'tippunion-isiflo-1-1-2-50-mm', 'stk', 486.8, 608.5, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo Ã— 2"', '63 mm', '2561164', 'tippunion-isiflo-2-63-mm', 'stk', 773, 966.25, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'StÃ¸ttehylse Isiflo', '25 mm', '2564029', 'stottehylse-isiflo-25-mm', 'stk', 37.1, 46.38, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'StÃ¸ttehylse Isiflo', '32 mm', '2564034', 'stottehylse-isiflo-32-mm', 'stk', 42.2, 52.75, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'StÃ¸ttehylse Isiflo', '40 mm', '2564039', 'stottehylse-isiflo-40-mm', 'stk', 82.6, 103.25, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'StÃ¸ttehylse Isiflo', '50 mm', '2564044', 'stottehylse-isiflo-50-mm', 'stk', 105, 131.25, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'StÃ¸ttehylse Isiflo', '63 mm', '2564054', 'stottehylse-isiflo-63-mm', 'stk', 147.35, 184.19, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Bakkekran Isiflo m/mutter', '32 mm', '3383606', 'bakkekran-isiflo-m-mutter-32-mm', 'stk', 990.1, 1237.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Bakkekran Isiflo m/mutter', '40 mm', '3383608', 'bakkekran-isiflo-m-mutter-40-mm', 'stk', 1899.6, 2374.5, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Spindelforlenger XO 97-165 cm', null, '3351033', 'spindelforlenger-xo-97-165-cm', 'stk', 539, 673.75, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Spindelforlenger XO 147-266 cm', null, '3351032', 'spindelforlenger-xo-147-266-cm', 'stk', 621.25, 776.56, 0, 0, 19);



-- >>> 20260810130000_prisimport.sql <<<

-- Import av prisliste frÃ¥ grossist.
--
-- NÃ¸kkelen er varenummeret (sku). Namn, dimensjon, hylleplass og beholdning blir
-- IKKJE rÃ¸rte: admin kan ha retta dei for hand, og ei prisoppdatering skal ikkje
-- skrive over det arbeidet. Det einaste som blir endra er innkjÃ¸psprisen og
-- salsprisen som fÃ¸lgjer av han.
--
-- Alt skjer i Ã©in operasjon. 156 enkeltoppdateringar frÃ¥ nettlesaren ville teke
-- lang tid og kunne stoppa halvvegs, og dÃ¥ hadde halve katalogen hatt nye prisar
-- og halve gamle â€“ utan at nokon visste kvar grensa gjekk.

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
    raise exception 'Ingen varelinjer Ã¥ importere';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'For mange varelinjer i Ã©n import';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 1000 then
    raise exception 'Ugyldig pÃ¥slag';
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

  -- Varenummer i fila som ikkje finst i katalogen. Grensesnittet tilbyr Ã¥
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

