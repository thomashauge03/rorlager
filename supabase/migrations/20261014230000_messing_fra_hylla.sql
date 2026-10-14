-- Sju messingdeler som står på hylla, men mangla i tellelista frå januar og
-- difor ikkje kom med i 20261014220000_katalog_telleliste_2025. Namn og
-- varenummer er lesne av Dahl-etikettane på kassane, 14.10.2026.
--
-- Etikettane har ingen pris, så både innkjøps- og salsprisen står tomme. Kunden
-- ser «–» i staden for ein pris; kontoret legg prisen inn for hand eller med
-- neste prisimport frå Dahl, som treffer på varenummeret.
--
-- KØYRER BERRE FØRSTE GONG, same grunn som i katalog_dahl: ligg nokon av desse
-- varene der frå før, er dette ei omkøyring, og ingenting skjer.

drop table if exists _messing_fra_hylla;
create temporary table _messing_fra_hylla (name text, sku text, qr_slug text, sort_order integer);

insert into _messing_fra_hylla (name, sku, qr_slug, sort_order) values
  ('Albue messing 2" R', '5020109', 'albue-messing-2-r', 201),
  ('Nippelmuffe messing 1" R', '5020336', 'nippelmuffe-messing-1-r', 202),
  ('Nippelmuffe messing 1"x 3/4"', '5020362', 'nippelmuffe-messing-1-x-3-4', 203),
  ('Overgangsnippel 1"x 3/4"', '5020433', 'overgangsnippel-1-x-3-4', 204),
  ('Overgangsnippel 1 1/4"x 1"', '5020436', 'overgangsnippel-1-1-4-x-1', 205),
  ('Overgangsnippel 1 1/2"x1 1/4"', '5020441', 'overgangsnippel-1-1-2-x1-1-4', 206),
  ('Plugg messing 2" R', '5020489', 'plugg-messing-2-r', 207);

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories where name = 'Messingdeler'),
  t.name, null, t.sku, t.qr_slug, 'stk', null, null, 0, 0, t.sort_order
from _messing_fra_hylla t
where not exists (select 1 from public.pipe_types p join _messing_fra_hylla t2 on t2.sku = p.sku)
on conflict do nothing;

drop table _messing_fra_hylla;
