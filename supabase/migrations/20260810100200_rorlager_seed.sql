-- Startkatalog. Prisar og beholdningar er utgangspunkt som admin justerer i
-- appen – poenget er at lageret ikkje er tomt første gongen nokon skannar.
-- Køyrer trygt fleire gonger: alt er nøkla på sku.

insert into public.pipe_categories (name, description, color, sort_order) values
  ('PVC avløpsrør', 'Grå avløps- og spillvannsrør', '#5b6b7a', 1),
  ('PE trykkrør',   'Svart PE100 til vann og trykk', '#1f2933', 2),
  ('Drensrør',      'Drenering med og uten filter',  '#6b8f3a', 3),
  ('Betongrør',     'Betong til vei og stikkrenner', '#8a8a8a', 4),
  ('Kabelrør',      'Trekkerør og varerør',          '#c8462a', 5),
  ('Deler og skjøt','Bend, muffer, grenrør og klemmer', '#a67c00', 6)
on conflict (name) do nothing;

with cat as (select id, name from public.pipe_categories)
insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, price, stock, low_stock_threshold, location, sort_order)
values
  ((select id from cat where name = 'PVC avløpsrør'), 'PVC avløpsrør SN8', '110 mm', 'PVC-110', 'pvc-110', 'm',  89,  240, 40, 'A-01', 1),
  ((select id from cat where name = 'PVC avløpsrør'), 'PVC avløpsrør SN8', '160 mm', 'PVC-160', 'pvc-160', 'm', 149,  180, 30, 'A-02', 2),
  ((select id from cat where name = 'PVC avløpsrør'), 'PVC avløpsrør SN8', '200 mm', 'PVC-200', 'pvc-200', 'm', 229,  120, 20, 'A-03', 3),
  ((select id from cat where name = 'PVC avløpsrør'), 'PVC avløpsrør SN8', '250 mm', 'PVC-250', 'pvc-250', 'm', 349,   60, 12, 'A-04', 4),
  ((select id from cat where name = 'PVC avløpsrør'), 'PVC avløpsrør SN8', '315 mm', 'PVC-315', 'pvc-315', 'm', 489,   40, 10, 'A-05', 5),

  ((select id from cat where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør', '32 mm',  'PE-32',  'pe-32',  'm',  22, 600, 100, 'B-01', 1),
  ((select id from cat where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør', '40 mm',  'PE-40',  'pe-40',  'm',  32, 450,  80, 'B-02', 2),
  ((select id from cat where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør', '50 mm',  'PE-50',  'pe-50',  'm',  46, 300,  60, 'B-03', 3),
  ((select id from cat where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør', '63 mm',  'PE-63',  'pe-63',  'm',  69, 250,  50, 'B-04', 4),
  ((select id from cat where name = 'PE trykkrør'), 'PE100 SDR11 trykkrør', '110 mm', 'PE-110', 'pe-110', 'm', 189, 120,  25, 'B-05', 5),

  ((select id from cat where name = 'Drensrør'), 'Drensrør med filter',  '110 mm', 'DR-110F', 'dr-110f', 'm', 62, 300, 50, 'C-01', 1),
  ((select id from cat where name = 'Drensrør'), 'Drensrør uten filter', '110 mm', 'DR-110',  'dr-110',  'm', 48, 250, 50, 'C-02', 2),
  ((select id from cat where name = 'Drensrør'), 'Drensrør med filter',  '160 mm', 'DR-160F', 'dr-160f', 'm', 96, 120, 20, 'C-03', 3),

  ((select id from cat where name = 'Betongrør'), 'Betongrør stikkrenne', '300 mm', 'BET-300', 'bet-300', 'stk', 690, 24, 6, 'D-01', 1),
  ((select id from cat where name = 'Betongrør'), 'Betongrør stikkrenne', '400 mm', 'BET-400', 'bet-400', 'stk', 980, 16, 4, 'D-02', 2),

  ((select id from cat where name = 'Kabelrør'), 'Kabelrør SN8 rødt', '110 mm', 'KAB-110', 'kab-110', 'm', 58, 400, 60, 'E-01', 1),
  ((select id from cat where name = 'Kabelrør'), 'Trekkerør',         '50 mm',  'KAB-50',  'kab-50',  'm', 26, 500, 80, 'E-02', 2),

  ((select id from cat where name = 'Deler og skjøt'), 'Bend 45° PVC',        '110 mm',     'DEL-B45-110', 'del-b45-110', 'stk',  89, 60, 10, 'F-01', 1),
  ((select id from cat where name = 'Deler og skjøt'), 'Bend 90° PVC',        '110 mm',     'DEL-B90-110', 'del-b90-110', 'stk',  95, 40, 10, 'F-02', 2),
  ((select id from cat where name = 'Deler og skjøt'), 'Muffe PVC',           '110 mm',     'DEL-M-110',   'del-m-110',   'stk',  65, 80, 15, 'F-03', 3),
  ((select id from cat where name = 'Deler og skjøt'), 'Grenrør 45°',         '110/110 mm', 'DEL-G-110',   'del-g-110',   'stk', 149, 30,  6, 'F-04', 4),
  ((select id from cat where name = 'Deler og skjøt'), 'Overgang PVC/PE',     '110 mm',     'DEL-O-110',   'del-o-110',   'stk', 219, 12,  4, 'F-05', 5),
  ((select id from cat where name = 'Deler og skjøt'), 'Rørklemme',           '110 mm',     'DEL-K-110',   'del-k-110',   'stk',  39, 100, 20, 'F-06', 6)
on conflict (sku) do nothing;
