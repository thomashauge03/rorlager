-- Varekatalog frå prislista til Brødrene Dahl (tilbod 94587, revidert 10.08.26).
--
-- Prisane i lista er NETTO innkjøpspris eks. mva. Dei blir lagde inn som
-- cost_price, og salsprisen er rekna ut med påslaget under. Påslaget ligg òg i
-- pipe_settings, slik at det kan endrast eitt sted seinare – sjå prisjusteringa
-- i adminpanelet.
--
-- Demokatalogen frå oppstarten blir fjerna. Bestillingar som alt peikar på dei
-- gamle varene beheld namn og pris på linjene sine; det er berre peikaren som
-- forsvinn, og det er med vilje: historikken skal ikkje endre seg.

-- Startpåslag: 25 %
update public.pipe_settings set markup_percent = 25 where id = 1;

delete from public.pipe_types;
delete from public.pipe_categories;

insert into public.pipe_categories (name, color, sort_order) values
  ('Overvannsrør', '#2f6f9f', 1),
  ('Avløpsrør', '#5b6b7a', 2),
  ('Drensrør', '#6b8f3a', 3),
  ('PE trykkrør', '#1f2933', 4),
  ('Deler overvann', '#3f8fbf', 5),
  ('Deler avløp', '#8a7a5a', 6),
  ('PE-deler', '#4a4a4a', 7),
  ('Koblinger og kraner', '#a67c00', 8);

-- Overvannsrør (18 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '100 mm', '3100501', 'overvannsror-x-stream-sn8-100-mm', 'm', 66.7, 83.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '150 mm', '3100502', 'overvannsror-x-stream-sn8-150-mm', 'm', 120.4, 150.5, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '200 mm', '3100504', 'overvannsror-x-stream-sn8-200-mm', 'm', 195.4, 244.25, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '250 mm', '3100506', 'overvannsror-x-stream-sn8-250-mm', 'm', 297.3, 371.63, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '300 mm', '3100508', 'overvannsror-x-stream-sn8-300-mm', 'm', 405.7, 507.13, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '400 mm', '3100511', 'overvannsror-x-stream-sn8-400-mm', 'm', 707.8, 884.75, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '500 mm', '3100513', 'overvannsror-x-stream-sn8-500-mm', 'm', 1307.5, 1634.38, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør X-Stream SN8', '600 mm', '3100515', 'overvannsror-x-stream-sn8-600-mm', 'm', 1418.8, 1773.5, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '200/225 mm', '3012422', 'overvannsror-iq-sn8-200-225-mm', 'm', 214.3, 267.88, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '300/338 mm', '3012426', 'overvannsror-iq-sn8-300-338-mm', 'm', 396.1, 495.13, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '400/450 mm', '3012428', 'overvannsror-iq-sn8-400-450-mm', 'm', 644, 805, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '500/560 mm', '3012431', 'overvannsror-iq-sn8-500-560-mm', 'm', 1138.1, 1422.63, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '600/684 mm', '3012433', 'overvannsror-iq-sn8-600-684-mm', 'm', 1380.8, 1726, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '800/902 mm', '3012436', 'overvannsror-iq-sn8-800-902-mm', 'm', 2736.3, 3420.38, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør IQ SN8', '1000/1154 mm', '3012439', 'overvannsror-iq-sn8-1000-1154-mm', 'm', 6528, 8160, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør PVC glatt', '110 mm', '2295601', 'overvannsror-pvc-glatt-110-mm', 'm', 63.7, 79.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør PVC glatt', '160 mm', '2295603', 'overvannsror-pvc-glatt-160-mm', 'm', 148.2, 185.25, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Overvannsrør'), 'Overvannsrør PVC glatt', '200 mm', '2295604', 'overvannsror-pvc-glatt-200-mm', 'm', 190.8, 238.5, 0, 0, 18);

-- Avløpsrør (3 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Avløpsrør'), 'Avløpsrør PVC', '110 mm', '2251059', 'avlopsror-pvc-110-mm', 'm', 63.7, 79.63, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Avløpsrør'), 'Avløpsrør PVC', '160 mm', '2251119', 'avlopsror-pvc-160-mm', 'm', 148.5, 185.63, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Avløpsrør'), 'Avløpsrør PVC', '200 mm', '2251159', 'avlopsror-pvc-200-mm', 'm', 190.1, 237.63, 0, 0, 3);

-- Drensrør (4 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør PE korrugert', '110 mm', '1381970', 'drensror-pe-korrugert-110-mm', 'm', 49.1, 61.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør PE korrugert', '160 mm', '1381971', 'drensror-pe-korrugert-160-mm', 'm', 124.5, 155.63, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør uten slisser', '83/100 mm', '3104919', 'drensror-uten-slisser-83-100-mm', 'm', 25.5, 31.88, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Drensrør'), 'Drensrør korrugert PEH', '83/100 mm', '3104629', 'drensror-korrugert-peh-83-100-mm', 'm', 21.76, 27.2, 0, 0, 4);

-- PE trykkrør (12 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 300 m)', '20 mm', '2392757', 'pe100-sdr11-trykkror-kveil-300-m-20-mm', 'm', 13.1, 16.38, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '20 mm', '2392743', 'pe100-sdr11-trykkror-kveil-50-m-20-mm', 'm', 14.6, 18.25, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 300 m)', '25 mm', '2392758', 'pe100-sdr11-trykkror-kveil-300-m-25-mm', 'm', 14.2, 17.75, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '25 mm', '2392746', 'pe100-sdr11-trykkror-kveil-50-m-25-mm', 'm', 16, 20, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 300 m)', '32 mm', '2392759', 'pe100-sdr11-trykkror-kveil-300-m-32-mm', 'm', 19.4, 24.25, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '32 mm', '2392749', 'pe100-sdr11-trykkror-kveil-50-m-32-mm', 'm', 23, 28.75, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 150 m)', '40 mm', '2392761', 'pe100-sdr11-trykkror-kveil-150-m-40-mm', 'm', 36.5, 45.63, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '40 mm', '2392752', 'pe100-sdr11-trykkror-kveil-50-m-40-mm', 'm', 36.3, 45.38, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 150 m)', '50 mm', '2392762', 'pe100-sdr11-trykkror-kveil-150-m-50-mm', 'm', 54.9, 68.63, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '50 mm', '2392753', 'pe100-sdr11-trykkror-kveil-50-m-50-mm', 'm', 57.4, 71.75, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 150 m)', '63 mm', '2392764', 'pe100-sdr11-trykkror-kveil-150-m-63-mm', 'm', 80.6, 100.75, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør (kveil 50 m)', '63 mm', '2392763', 'pe100-sdr11-trykkror-kveil-50-m-63-mm', 'm', 122.5, 153.13, 0, 0, 12);

-- Deler overvann (20 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '150 mm', '3100544', 'bend-x-stream-15gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '150 mm', '3100545', 'bend-x-stream-30gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '150 mm', '3100546', 'bend-x-stream-45gr-150-mm', 'stk', 202.6, 253.25, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '150 mm', '3100547', 'bend-x-stream-90gr-150-mm', 'stk', 327, 408.75, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '150 mm', '3100652', 'dobbeltmuffe-x-stream-150-mm', 'stk', 153.7, 192.13, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '200 mm', '3100548', 'bend-x-stream-15gr-200-mm', 'stk', 370, 462.5, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '200 mm', '3100549', 'bend-x-stream-30gr-200-mm', 'stk', 368.8, 461, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '200 mm', '3100551', 'bend-x-stream-45gr-200-mm', 'stk', 368.8, 461, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '200 mm', '3100552', 'bend-x-stream-90gr-200-mm', 'stk', 570, 712.5, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '200 mm', '3100653', 'dobbeltmuffe-x-stream-200-mm', 'stk', 216.3, 270.38, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '250 mm', '3100553', 'bend-x-stream-15gr-250-mm', 'stk', 1202.4, 1503, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '250 mm', '3100554', 'bend-x-stream-30gr-250-mm', 'stk', 1202.4, 1503, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '250 mm', '3100555', 'bend-x-stream-45gr-250-mm', 'stk', 1205.1, 1506.38, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '250 mm', '3100556', 'bend-x-stream-90gr-250-mm', 'stk', 1701, 2126.25, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '250 mm', '3100654', 'dobbeltmuffe-x-stream-250-mm', 'stk', 454.5, 568.13, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 15°', '300 mm', '3100557', 'bend-x-stream-15gr-300-mm', 'stk', 1863.5, 2329.38, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 30°', '300 mm', '3100558', 'bend-x-stream-30gr-300-mm', 'stk', 1863.5, 2329.38, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 45°', '300 mm', '3100559', 'bend-x-stream-45gr-300-mm', 'stk', 1865, 2331.25, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Bend X-Stream 90°', '300 mm', '3100561', 'bend-x-stream-90gr-300-mm', 'stk', 2613, 3266.25, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'Deler overvann'), 'Dobbeltmuffe X-Stream', '300 mm', '3100655', 'dobbeltmuffe-x-stream-300-mm', 'stk', 510.4, 638, 0, 0, 20);

-- Deler avløp (36 varer)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
values
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 15°', '110 mm', '2252254', 'bend-grunnavlop-15gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 1),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 30°', '110 mm', '2252264', 'bend-grunnavlop-30gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 2),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 45°', '110 mm', '2252269', 'bend-grunnavlop-45gr-110-mm', 'stk', 28.1, 35.13, 0, 0, 3),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 90°', '110 mm', '2252279', 'bend-grunnavlop-90gr-110-mm', 'stk', 39, 48.75, 0, 0, 4),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 15°', '160 mm', '2252374', 'bend-grunnavlop-15gr-160-mm', 'stk', 108.4, 135.5, 0, 0, 5),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 30°', '160 mm', '2252384', 'bend-grunnavlop-30gr-160-mm', 'stk', 121.9, 152.38, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 45°', '160 mm', '2252389', 'bend-grunnavlop-45gr-160-mm', 'stk', 121.9, 152.38, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 90°', '160 mm', '2252394', 'bend-grunnavlop-90gr-160-mm', 'stk', 205.5, 256.88, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 15°', '200 mm', '2252409', 'bend-grunnavlop-15gr-200-mm', 'stk', 251.7, 314.63, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 30°', '200 mm', '2252419', 'bend-grunnavlop-30gr-200-mm', 'stk', 260.3, 325.38, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 45°', '200 mm', '2252424', 'bend-grunnavlop-45gr-200-mm', 'stk', 260.5, 325.63, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend grunnavløp 90°', '200 mm', '2252434', 'bend-grunnavlop-90gr-200-mm', 'stk', 472.5, 590.63, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '110 mm', '2253014', 'grenror-grunnavlop-110-mm', 'stk', 65.4, 81.75, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '160X110 mm', '2253044', 'grenror-grunnavlop-160x110-mm', 'stk', 118.4, 148, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '160 mm', '2253054', 'grenror-grunnavlop-160-mm', 'stk', 175.4, 219.25, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp 45°', '200X110 mm', '2253084', 'grenror-grunnavlop-45gr-200x110-mm', 'stk', 327.7, 409.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Grenrør grunnavløp', '200X160 mm', '2253094', 'grenror-grunnavlop-200x160-mm', 'stk', 309.9, 387.38, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Løpemuffe grunnavløp', '110 mm', '2255209', 'lopemuffe-grunnavlop-110-mm', 'stk', 36.1, 45.13, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Løpemuffe grunnavløp', '160 mm', '2255224', 'lopemuffe-grunnavlop-160-mm', 'stk', 85.9, 107.38, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Løpemuffe grunnavløp', '200 mm', '2255234', 'lopemuffe-grunnavlop-200-mm', 'stk', 172.2, 215.25, 0, 0, 20),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Dobbelmuffe grunnavløp', '110 mm', '2255009', 'dobbelmuffe-grunnavlop-110-mm', 'stk', 36.3, 45.38, 0, 0, 21),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Dobbelmuffe grunnavløp', '160 mm', '2255024', 'dobbelmuffe-grunnavlop-160-mm', 'stk', 85.9, 107.38, 0, 0, 22),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Dobbelmuffe grunnavløp', '200 mm', '2255034', 'dobbelmuffe-grunnavlop-200-mm', 'stk', 172.2, 215.25, 0, 0, 23),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Ters grunnavløp', '110 mm', '2254709', 'ters-grunnavlop-110-mm', 'stk', 37.6, 47, 0, 0, 24),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Ters grunnavløp', '160 mm', '2254724', 'ters-grunnavlop-160-mm', 'stk', 62.9, 78.63, 0, 0, 25),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Ters grunnavløp', '200 mm', '2254734', 'ters-grunnavlop-200-mm', 'stk', 101.8, 127.25, 0, 0, 26),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 11°', '160 mm', '2251669', 'bend-langt-avlop-11gr-160-mm', 'stk', 691, 863.75, 0, 0, 27),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 22°', '160 mm', '2251679', 'bend-langt-avlop-22gr-160-mm', 'stk', 691, 863.75, 0, 0, 28),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 30°', '160 mm', '2251684', 'bend-langt-avlop-30gr-160-mm', 'stk', 691, 863.75, 0, 0, 29),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 45°', '160 mm', '2251689', 'bend-langt-avlop-45gr-160-mm', 'stk', 691, 863.75, 0, 0, 30),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 11°', '200 mm', '2251749', 'bend-langt-avlop-11gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 31),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 22°', '200 mm', '2251759', 'bend-langt-avlop-22gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 32),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 30°', '200 mm', '2251764', 'bend-langt-avlop-30gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 33),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Bend langt avløp 45°', '200 mm', '2251769', 'bend-langt-avlop-45gr-200-mm', 'stk', 1224.8, 1531, 0, 0, 34),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Stake- og spylegren PP', '110/200 mm', '3210046', 'stake-og-spylegren-pp-110-200-mm', 'stk', 546.5, 683.13, 0, 0, 35),
  ((select id from public.pipe_categories where name = 'Deler avløp'), 'Stake- og spylegren PP', '160/200 mm', '3210047', 'stake-og-spylegren-pp-160-200-mm', 'stk', 746.8, 933.5, 0, 0, 36);

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
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '32 mm', '2265571', 'elektroalbue-pe100-90gr-32-mm', 'stk', 88.74, 110.93, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '40 mm', '2265572', 'elektroalbue-pe100-90gr-40-mm', 'stk', 108.8, 136, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '50 mm', '2265573', 'elektroalbue-pe100-90gr-50-mm', 'stk', 140.76, 175.95, 0, 0, 19),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '63 mm', '2265574', 'elektroalbue-pe100-90gr-63-mm', 'stk', 158.44, 198.05, 0, 0, 20),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '75 mm', '2265575', 'elektroalbue-pe100-90gr-75-mm', 'stk', 251.6, 314.5, 0, 0, 21),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '90 mm', '2265576', 'elektroalbue-pe100-90gr-90-mm', 'stk', 287.3, 359.13, 0, 0, 22),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '110 mm', '2265577', 'elektroalbue-pe100-90gr-110-mm', 'stk', 404.6, 505.75, 0, 0, 23),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '125 mm', '2265578', 'elektroalbue-pe100-90gr-125-mm', 'stk', 579.7, 724.63, 0, 0, 24),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 90°', '160 mm', '2265579', 'elektroalbue-pe100-90gr-160-mm', 'stk', 965.6, 1207, 0, 0, 25),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '32 mm', '2265581', 'elektroalbue-pe100-45gr-32-mm', 'stk', 89.76, 112.2, 0, 0, 26),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '40 mm', '2265582', 'elektroalbue-pe100-45gr-40-mm', 'stk', 107.78, 134.73, 0, 0, 27),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '50 mm', '2265583', 'elektroalbue-pe100-45gr-50-mm', 'stk', 141.78, 177.23, 0, 0, 28),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '63 mm', '2265584', 'elektroalbue-pe100-45gr-63-mm', 'stk', 158.78, 198.48, 0, 0, 29),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '75 mm', '2265585', 'elektroalbue-pe100-45gr-75-mm', 'stk', 273.7, 342.13, 0, 0, 30),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '90 mm', '2265586', 'elektroalbue-pe100-45gr-90-mm', 'stk', 287.3, 359.13, 0, 0, 31),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '110 mm', '2265587', 'elektroalbue-pe100-45gr-110-mm', 'stk', 406.3, 507.88, 0, 0, 32),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '125 mm', '2265588', 'elektroalbue-pe100-45gr-125-mm', 'stk', 578, 722.5, 0, 0, 33),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'Elektroalbue PE100 45°', '160 mm', '2265589', 'elektroalbue-pe100-45gr-160-mm', 'stk', 965.6, 1207, 0, 0, 34),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '32 mm', '2462163', 't-ror-elektro-pe100-90gr-32-mm', 'stk', 117.64, 147.05, 0, 0, 35),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '40 mm', '2462165', 't-ror-elektro-pe100-90gr-40-mm', 'stk', 135.66, 169.58, 0, 0, 36),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '50 mm', '2462167', 't-ror-elektro-pe100-90gr-50-mm', 'stk', 173.4, 216.75, 0, 0, 37),
  ((select id from public.pipe_categories where name = 'PE-deler'), 'T-rør elektro PE100 90°', '63 mm', '2462169', 't-ror-elektro-pe100-90gr-63-mm', 'stk', 197.2, 246.5, 0, 0, 38),
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
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 3/4"', '25 mm', '2561429', 'tippunion-isiflo-3-4-25-mm', 'stk', 153.8, 192.25, 0, 0, 6),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 1"', '32 mm', '2561434', 'tippunion-isiflo-1-32-mm', 'stk', 170.1, 212.63, 0, 0, 7),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 1.1/4"', '40 mm', '2561439', 'tippunion-isiflo-1-1-4-40-mm', 'stk', 306.7, 383.38, 0, 0, 8),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 1.1/2"', '50 mm', '2561444', 'tippunion-isiflo-1-1-2-50-mm', 'stk', 486.8, 608.5, 0, 0, 9),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Tippunion Isiflo × 2"', '63 mm', '2561164', 'tippunion-isiflo-2-63-mm', 'stk', 773, 966.25, 0, 0, 10),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '25 mm', '2564029', 'stottehylse-isiflo-25-mm', 'stk', 37.1, 46.38, 0, 0, 11),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '32 mm', '2564034', 'stottehylse-isiflo-32-mm', 'stk', 42.2, 52.75, 0, 0, 12),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '40 mm', '2564039', 'stottehylse-isiflo-40-mm', 'stk', 82.6, 103.25, 0, 0, 13),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '50 mm', '2564044', 'stottehylse-isiflo-50-mm', 'stk', 105, 131.25, 0, 0, 14),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Støttehylse Isiflo', '63 mm', '2564054', 'stottehylse-isiflo-63-mm', 'stk', 147.35, 184.19, 0, 0, 15),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Bakkekran Isiflo m/mutter', '32 mm', '3383606', 'bakkekran-isiflo-m-mutter-32-mm', 'stk', 990.1, 1237.63, 0, 0, 16),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Bakkekran Isiflo m/mutter', '40 mm', '3383608', 'bakkekran-isiflo-m-mutter-40-mm', 'stk', 1899.6, 2374.5, 0, 0, 17),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Spindelforlenger XO 97-165 cm', null, '3351033', 'spindelforlenger-xo-97-165-cm', 'stk', 539, 673.75, 0, 0, 18),
  ((select id from public.pipe_categories where name = 'Koblinger og kraner'), 'Spindelforlenger XO 147-266 cm', null, '3351032', 'spindelforlenger-xo-147-266-cm', 'stk', 621.25, 776.56, 0, 0, 19);

