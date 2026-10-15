-- Dimensjon på dei siste varene som har mål i namnet. 20261015120000 hoppa
-- over heile Diverse, men rørskjøtane har rørdimensjonen, boltar, stag og
-- skruer M-målet, og spindelforlengarane lengda. Står igjen utan: mengder og
-- typar som ikkje er mål – 400 g, 150 m, 500 m kobbertråd, ZAK46 og dei to
-- teleskopiske spindelforlengarane utan mål på etiketten.
--
-- Berre der feltet er tomt, så ei omkøyring eller ein dimensjon kontoret har
-- sett, ikkje blir skriven over.

update public.pipe_types t
set dimension = d.dimensjon
from (values
  ('3113765', '12 mm'), -- Rørskjøt fiberrør DBS 12 mm
  ('3113766', '14 mm'), -- Rørskjøt fiberrør DBS 14 mm
  ('3521713', 'M16x130'), -- Boltesett M16x130 VZ kval. 8.8 (eske)
  ('3521005', 'M20x75'), -- Boltesett M20x75 VZ kval. 8.8 (eske)
  ('3476769', 'M12 x 1000 mm'), -- Gjengestag M12 x 1000 mm VZ 8.8
  ('3521354', 'M16 x 60'), -- Sekskantskrue syrefast M16 x 60 A4
  ('3351033', '97-165 cm'), -- Spindelforlenger XO 97-165 cm
  ('3351032', '147-266 cm') -- Spindelforlenger XO 147-266 cm
) as d(sku, dimensjon)
where t.sku = d.sku
  and (t.dimension is null or btrim(t.dimension) = '');
