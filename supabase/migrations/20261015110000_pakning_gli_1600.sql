-- Pakning GLI 1600 for betongkumring, Dahl 2182009. Står på hylla, men mangla
-- i tellelista frå januar. Namn og varenummer er lesne av hylleetiketten,
-- 15.10.2026. Ingen pris på etiketten, så prisane står tomme til neste
-- prisimport eller til kontoret legg dei inn – kunden ser «–».
--
-- Ligg varenummeret der frå før, skjer ingenting ved omkøyring. Blir varen
-- sletta, kjem han att neste gong setup-fila blir køyrd – slå han heller av.

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories where name = 'Kummer og lokk'),
  'Pakning GLI 1600 for betongkumring', null, '2182009', 'pakning-gli-1600-for-betongkumring', 'stk', null, null, 0, 0, 126
where not exists (select 1 from public.pipe_types where sku = '2182009')
on conflict do nothing;
