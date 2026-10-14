-- Overgang for grunnavløp 200x160 i plast, Dahl 2255459. Står på hylla, men
-- mangla i tellelista frå januar. Namn og varenummer er lesne av hylleetiketten,
-- 14.10.2026. Etiketten har ingen pris, så prisane står tomme til neste
-- prisimport eller til kontoret legg dei inn – kunden ser «–».
--
-- Ligg varenummeret der frå før, skjer ingenting ved omkøyring, så namn, pris
-- og beholdning kontoret har lagt inn står. Blir varen sletta, kjem han att neste
-- gong setup-fila blir køyrd – slå han heller av («inaktiv») om han skal bort.

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories where name = 'Deler avløp'),
  'Overgang grunnavløp 200x160 plast', null, '2255459', 'overgang-grunnavlop-200x160-plast', 'stk', null, null, 0, 0, 201
where not exists (select 1 from public.pipe_types where sku = '2255459')
on conflict do nothing;
