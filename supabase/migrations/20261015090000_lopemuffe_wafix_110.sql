-- Løpemuffe PP Wafix sort 110, Dahl 2215327. Står på hylla, men mangla i
-- tellelista frå januar. Namn og varenummer er lesne av hylleetiketten,
-- 15.10.2026. Ingen pris på etiketten, så prisane står tomme til neste
-- prisimport eller til kontoret legg dei inn – kunden ser «–».
--
-- Ligg varenummeret der frå før, skjer ingenting ved omkøyring. Blir varen
-- sletta, kjem han att neste gong setup-fila blir køyrd – slå han heller av.

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories where name = 'Innvendig avløp (Wafix)'),
  'Løpemuffe 110 mm PP Wafix sort', null, '2215327', 'lopemuffe-110-mm-pp-wafix-sort', 'stk', null, null, 0, 0, 116
where not exists (select 1 from public.pipe_types where sku = '2215327')
on conflict do nothing;
