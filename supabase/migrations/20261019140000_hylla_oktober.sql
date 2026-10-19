-- 34 varer som står på hylla med Dahl-etikett, men mangla i appen. Namn,
-- varenummer og eining er lesne av hylleetikettane, 19.10.2026 – same runde
-- som 40 andre etikettar som alt fanst. Ingen pris på etikettane, så prisane
-- står tomme til neste prisimport eller til kontoret legg dei inn – kunden ser
-- «–». Namna følgjer resten av katalogen; dimensjonen står i eige felt.
--
-- X-Stream 3 m har eigne varenummer ved sida av 6 m-røra, som alt finst.
-- 2181002 (toppring 650x500) var smått skrive på biletet – sjekk etiketten.
--
-- Ligg varenummeret der frå før, skjer ingenting ved omkøyring. Blir ei vare
-- sletta, kjem ho att neste gong setup-fila blir køyrd – slå ho heller av.

drop table if exists _hylla_oktober;
create temporary table _hylla_oktober (
  kategori text, name text, dimension text, sku text, qr_slug text, unit text, sort_order integer
);

insert into _hylla_oktober (kategori, name, dimension, sku, qr_slug, unit, sort_order) values
  ('Overvannsrør', 'Overvannsrør X-Stream SN8 3 m', '200 mm', '3100503', 'overvannsror-x-stream-sn8-3-m-200-mm', 'm', 110),
  ('Overvannsrør', 'Overvannsrør X-Stream SN8 3 m', '250 mm', '3100505', 'overvannsror-x-stream-sn8-3-m-250-mm', 'm', 111),
  ('Overvannsrør', 'Overvannsrør X-Stream SN8 3 m', '300 mm', '3100507', 'overvannsror-x-stream-sn8-3-m-300-mm', 'm', 112),
  ('Overvannsrør', 'Overvannsrør X-Stream SN8 3 m', '400 mm', '3100509', 'overvannsror-x-stream-sn8-3-m-400-mm', 'm', 113),
  ('Overvannsrør', 'Overvannsrør X-Stream SN8 3 m', '500 mm', '3100512', 'overvannsror-x-stream-sn8-3-m-500-mm', 'm', 114),
  ('Overvannsrør', 'Overvannsrør X-Stream SN8 3 m', '600 mm', '3100514', 'overvannsror-x-stream-sn8-3-m-600-mm', 'm', 115),
  ('Drensrør', 'Drensrør X-Stream', '150 mm', '3100529', 'drensror-x-stream-150-mm', 'm', 102),
  ('Drensrør', 'Drensrør X-Stream', '200 mm', '3100531', 'drensror-x-stream-200-mm', 'm', 103),
  ('Avløpsrør', 'Avløpsrør PVC', '125 mm', '2251079', 'avlopsror-pvc-125-mm', 'm', 102),
  ('Avløpsrør', 'Avløpsrør PVC', '250 mm', '2251199', 'avlopsror-pvc-250-mm', 'm', 103),
  ('Avløpsrør', 'Avløpsrør PVC', '315 mm', '2251239', 'avlopsror-pvc-315-mm', 'm', 104),
  ('Kabelrør', 'Kabelrør 50 mm rød PP', '50 mm', '3025851', 'kabelror-50-mm-rod-pp', 'stk', 110),
  ('Kabelrør', 'Kabelrør 50 mm kveil rød DV m/trekketråd', '50 mm', '3026001', 'kabelror-50-mm-kveil-rod-dv-m-trekketrad', 'm', 111),
  ('PE trykkrør', 'PE80 SDR11 PN12,5 trykkrør (kveil 25 m)', '32 mm', '2392012', 'pe80-sdr11-pn12-5-trykkror-kveil-25-m-32-mm', 'm', 106),
  ('PE trykkrør', 'PE80 SDR11 PN12,5 trykkrør (kveil 50 m)', '32 mm', '2392013', 'pe80-sdr11-pn12-5-trykkror-kveil-50-m-32-mm', 'm', 107),
  ('PE trykkrør', 'PE80 SDR11 PN10 trykkrør (kveil 300 m)', '32 mm', '2394034', 'pe80-sdr11-pn10-trykkror-kveil-300-m-32-mm', 'm', 108),
  ('PE trykkrør', 'PE80 SDR11 PN10 trykkrør (kveil 150 m)', '40 mm', '2394039', 'pe80-sdr11-pn10-trykkror-kveil-150-m-40-mm', 'm', 109),
  ('PE trykkrør', 'PE80 SDR11 PN10 trykkrør (kveil 150 m)', '50 mm', '2394044', 'pe80-sdr11-pn10-trykkror-kveil-150-m-50-mm', 'm', 110),
  ('PE trykkrør', 'PE80 SDR11 PN10 trykkrør (kveil 150 m)', '63 mm', '2394054', 'pe80-sdr11-pn10-trykkror-kveil-150-m-63-mm', 'm', 111),
  ('Kummer og lokk', 'Lokk betong 650x60 mm', '650x60 mm', '2181203', 'lokk-betong-650x60-mm', 'stk', 127),
  ('Kummer og lokk', 'Kjegle betong 1000x500 mm eksentrisk', '1000x500 mm', '2181103', 'kjegle-betong-1000x500-mm-eksentrisk', 'stk', 128),
  ('Kummer og lokk', 'Toppring betong 650x50 mm', '650x50 mm', '2181133', 'toppring-betong-650x50-mm', 'stk', 129),
  ('Kummer og lokk', 'Toppring betong 650x100 mm', '650x100 mm', '2181136', 'toppring-betong-650x100-mm', 'stk', 130),
  ('Kummer og lokk', 'Toppring betong 650x500 mm', '650x500 mm', '2181002', 'toppring-betong-650x500-mm', 'stk', 131),
  ('Kummer og lokk', 'Kumring betong 1600x1000 mm', '1600x1000 mm', '2181039', 'kumring-betong-1600x1000-mm', 'stk', 132),
  ('Kummer og lokk', 'Kumring betong 1200x1000 mm', '1200x1000 mm', '2181019', 'kumring-betong-1200x1000-mm', 'stk', 133),
  ('Kummer og lokk', 'Kumring betong 1200x500 mm', '1200x500 mm', '2181016', 'kumring-betong-1200x500-mm', 'stk', 134),
  ('Innvendig avløp (Wafix)', 'Bend 90x88° PP', '90 mm', '2202324', 'bend-90x88-pp-90-mm', 'stk', 118),
  ('Innvendig avløp (Wafix)', 'Stakerør m/lokk 90 mm PP', '90 mm', '2204939', 'stakeror-m-lokk-90-mm-pp', 'stk', 119),
  ('Diverse', 'Håndsag universal 22" m/logo', null, '9824942', 'handsag-universal-22-m-logo', 'stk', 110),
  ('Diverse', 'Reparasjonsasfalt bøtte 20 kg', null, '9723352', 'reparasjonsasfalt-botte-20-kg', 'stk', 111),
  ('Diverse', 'Primer spray for reparasjonsasfalt 600 ml', null, '9723356', 'primer-spray-for-reparasjonsasfalt-600-ml', 'stk', 112),
  ('Diverse', 'Spiss spade stor Fiskars', null, '9842502', 'spiss-spade-stor-fiskars', 'stk', 113),
  ('Diverse', 'Halvrund rasp 8" grov m/skaft Sandvik', null, '9823773', 'halvrund-rasp-8-grov-m-skaft-sandvik', 'stk', 114);

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories c where c.name = t.kategori),
  t.name, t.dimension, t.sku, t.qr_slug, t.unit, null, null, 0, 0, t.sort_order
from _hylla_oktober t
where not exists (select 1 from public.pipe_types p where p.sku = t.sku)
on conflict do nothing;

drop table _hylla_oktober;
