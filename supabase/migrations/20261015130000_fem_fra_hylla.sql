-- Fem varer som står på hylla med Dahl-etikett, men mangla i tellelista frå
-- januar. Namn og varenummer er lesne av hylleetikettane, 15.10.2026. Ingen
-- pris på etikettane, så prisane står tomme til neste prisimport eller til
-- kontoret legg dei inn – kunden ser «–». Dimensjonen står både i namnet og i
-- eige felt, som på resten av katalogen.
--
-- Same runde: bakkekrana 3383324 har ikkje hatt dimensjon. Etiketten seier
-- DN 32/40.
--
-- Ligg varenummeret der frå før, skjer ingenting ved omkøyring. Blir ei vare
-- sletta, kjem ho att neste gong setup-fila blir køyrd – slå ho heller av.

drop table if exists _fem_fra_hylla;
create temporary table _fem_fra_hylla (kategori text, name text, dimension text, sku text, qr_slug text, sort_order integer);

insert into _fem_fra_hylla (kategori, name, dimension, sku, qr_slug, sort_order) values
  ('Diverse', 'Gjengesnor Loctite 55 150 m', null, '9511512', 'gjengesnor-loctite-55-150-m', 108),
  ('Diverse', 'Rørskjøt fiberrør DBS 12 mm', null, '3113765', 'rorskjot-fiberror-dbs-12-mm', 109),
  ('Ventiler og vannverk', 'Slusekran sterk m/ratt 1 1/2" messing', '1 1/2"', '5504234', 'slusekran-sterk-m-ratt-1-1-2-messing', 127),
  ('PE-deler', 'T-rør 20 mm PRK', '20 mm', '2511224', 't-ror-20-mm-prk', 113),
  ('PE-deler', 'T-rør 25 mm PRK', '25 mm', '2511229', 't-ror-25-mm-prk', 114);

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories c where c.name = t.kategori),
  t.name, t.dimension, t.sku, t.qr_slug, 'stk', null, null, 0, 0, t.sort_order
from _fem_fra_hylla t
where not exists (select 1 from public.pipe_types p where p.sku = t.sku)
on conflict do nothing;

drop table _fem_fra_hylla;

update public.pipe_types
set dimension = 'DN32/40'
where sku = '3383324'
  and (dimension is null or btrim(dimension) = '');
