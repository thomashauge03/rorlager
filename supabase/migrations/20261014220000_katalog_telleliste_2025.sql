-- Varene frå tellelista til Brødrene Dahl (kundenr. 30015006, 20.01.2026) som
-- ikkje fanst i katalogen.
--
-- Tellelista har 272 varelinjer. 45 av dei låg alt her med same varenummer og blir
-- ikkje rørte – namn, pris og hylle kan vere retta for hand. Dei 227 andre kjem inn
-- under:
--
--   Overvannsrør                 9
--   Avløpsrør                    1
--   Drensrør                     1
--   PE trykkrør                  5
--   PVC trykkrør                 7
--   Kabelrør                     9
--   Deler overvann              11
--   Deler avløp                 18
--   PE-deler                    12
--   Innvendig avløp (Wafix)     17
--   Koblinger og kraner         25
--   Messingdeler                54
--   Ventiler og vannverk        26
--   Kummer og lokk              25
--   Diverse                      7
--
-- Eininga er den Dahl tel i. Eit rør som står som STK i lista er éi lengd, og
-- prisen er per lengd, så det kjem inn som «stk» – ikkje omrekna til meter, for
-- lista seier ikkje alltid kor lang lengda er. Kveil, trommel, eske og flaske
-- blir òg «stk», med eininga i namnet.
--
-- Prisen i lista er netto innkjøpspris eks. mva. Han blir cost_price, og
-- salsprisen blir rekna med påslaget som står i innstillingane no.
--
-- Beholdninga blir 0 som resten av katalogen. Teljinga er frå januar og skal
-- ikkje stå som sanning om lageret i dag.
--
-- KØYRER BERRE FØRSTE GONG, same grunn som i katalog_dahl: supabase-setup.sql
-- blir køyrd på nytt for kvar ny migrasjon. Ligg nokon av desse varene der
-- frå før, er dette ei omkøyring, og ingenting skjer – heller ikkje for ei vare
-- kontoret har sletta med vilje.

drop table if exists _telleliste_2025;
create temporary table _telleliste_2025 (
  kategori text, name text, sku text, qr_slug text, cost numeric, sort_order integer
);

insert into _telleliste_2025 (kategori, name, sku, qr_slug, cost, sort_order) values
  ('Overvannsrør', 'Overvannsrør Pragma 110/97-6m sort', '3074509', 'overvannsror-pragma-110-97-6m-sort', 249.6, 101),
  ('Overvannsrør', 'Overvannsrør Pragma 160/139-6m sort', '3074524', 'overvannsror-pragma-160-139-6m-sort', 524.16, 102),
  ('Overvannsrør', 'Overvannsrør Pragma 200/174-6m sort', '3074534', 'overvannsror-pragma-200-174-6m-sort', 823.68, 103),
  ('Overvannsrør', 'Overvannsrør Pragma Infra 300-6m', '3074973', 'overvannsror-pragma-infra-300-6m', 1891.2, 104),
  ('Overvannsrør', 'Overvannsrør Pragma Infra 400-6m', '3074974', 'overvannsror-pragma-infra-400-6m', 3408, 105),
  ('Overvannsrør', 'Rør overvann 110 mm sort PP', '3023751', 'ror-overvann-110-mm-sort-pp', 654.72, 106),
  ('Overvannsrør', 'Rør overvann 160 mm sort PP', '3023753', 'ror-overvann-160-mm-sort-pp', 1497.6, 107),
  ('Overvannsrør', 'Rør overvann 200 mm sort PP', '3023754', 'ror-overvann-200-mm-sort-pp', 1977.6, 108),
  ('Overvannsrør', 'Rør overvann 800 X-Stream 6 m', '3100516', 'ror-overvann-800-x-stream-6-m', 21984, 109),
  ('Avløpsrør', 'Stigerør Pragma spillvann 400-6m RB', '3080809', 'stigeror-pragma-spillvann-400-6m-rb', 6990, 101),
  ('Drensrør', 'Drensrør Pragma toppslisset 110/97 6 m', '3070809', 'drensror-pragma-toppslisset-110-97-6-m', 192, 101),
  ('PE trykkrør', 'Rør 110 mm PE100 SDR17 6 m', '2395159', 'ror-110-mm-pe100-sdr17-6-m', 728.64, 101),
  ('PE trykkrør', 'Rør 160 mm PE100 SDR17 6 m', '2395162', 'ror-160-mm-pe100-sdr17-6-m', 1417.68, 102),
  ('PE trykkrør', 'Rør 200 mm PE100 SDR17 6 m', '2395163', 'ror-200-mm-pe100-sdr17-6-m', 2257.2, 103),
  ('PE trykkrør', 'Rør 32 mm PE100 SDR11 PN10', '2395108', 'ror-32-mm-pe100-sdr11-pn10', 73.71, 104),
  ('PE trykkrør', 'Rør 50 mm PE100 SDR11 PN10', '2395111', 'ror-50-mm-pe100-sdr11-pn10', 181.44, 105),
  ('PVC trykkrør', 'Bend 110 mm 11° PVC m/1 muffe', '2351824', 'bend-110-mm-11gr-pvc-m-1-muffe', 546.5, 101),
  ('PVC trykkrør', 'Bend 110 mm 90° PVC m/1 muffe', '2351849', 'bend-110-mm-90gr-pvc-m-1-muffe', 843.5, 102),
  ('PVC trykkrør', 'Bend 160 mm 22° PVC m/1 muffe', '2351859', 'bend-160-mm-22gr-pvc-m-1-muffe', 1190, 103),
  ('PVC trykkrør', 'Bend 160 mm 30° PVC m/1 muffe', '2351864', 'bend-160-mm-30gr-pvc-m-1-muffe', 1190, 104),
  ('PVC trykkrør', 'Trykkrør 110 mm PVC PN12,5', '2350449', 'trykkror-110-mm-pvc-pn12-5', 732, 105),
  ('PVC trykkrør', 'Trykkrør 160 mm PVC PN12,5', '2350459', 'trykkror-160-mm-pvc-pn12-5', 1489.8, 106),
  ('PVC trykkrør', 'Trykkrør 315 mm PVC PN12,5', '2350494', 'trykkror-315-mm-pvc-pn12-5', 5779.2, 107),
  ('Kabelrør', 'Kabelbend 110 mm 15° R2000 rød', '3025867', 'kabelbend-110-mm-15gr-r2000-rod', 441.6, 101),
  ('Kabelrør', 'Kabelbend 75 mm 30° R600 rød', '3025889', 'kabelbend-75-mm-30gr-r600-rod', 537.6, 102),
  ('Kabelrør', 'Kabelrør 110 mm gul PP', '3025861', 'kabelror-110-mm-gul-pp', 301.2, 103),
  ('Kabelrør', 'Kabelrør 110 mm kveil rød DV', '3026021', 'kabelror-110-mm-kveil-rod-dv', 2370, 104),
  ('Kabelrør', 'Kabelrør 110 mm rød PP', '3025856', 'kabelror-110-mm-rod-pp', 301.2, 105),
  ('Kabelrør', 'Kabelrør 160 mm rød PP', '3025863', 'kabelror-160-mm-rod-pp', 717, 106),
  ('Kabelrør', 'Kabelrør 3*40 mm gul DL (trommel)', '3026035', 'kabelror-3-40-mm-gul-dl-trommel', 29900, 107),
  ('Kabelrør', 'Kabelrør 33/40 mm gul GL à 150 m (kveil)', '3110119', 'kabelror-33-40-mm-gul-gl-a-150-m-kveil', 7740, 108),
  ('Kabelrør', 'Kabelrør 75 mm rød PP', '3025854', 'kabelror-75-mm-rod-pp', 199.2, 109),
  ('Deler overvann', 'Løpemuffe 150 X-Stream', '3100662', 'lopemuffe-150-x-stream', 152.2, 101),
  ('Deler overvann', 'Pakning 100 X-Stream', '3100671', 'pakning-100-x-stream', 22.17, 102),
  ('Deler overvann', 'Pakning 150 X-Stream', '3100672', 'pakning-150-x-stream', 27.5, 103),
  ('Deler overvann', 'Pakning 200 X-Stream', '3100673', 'pakning-200-x-stream', 45.3, 104),
  ('Deler overvann', 'Pakning 250 X-Stream', '3100674', 'pakning-250-x-stream', 66.9, 105),
  ('Deler overvann', 'Pakning 300 X-Stream', '3100675', 'pakning-300-x-stream', 120.4, 106),
  ('Deler overvann', 'Pakning 400 X-Stream', '3100676', 'pakning-400-x-stream', 140.9, 107),
  ('Deler overvann', 'Pakning 500 X-Stream', '3100677', 'pakning-500-x-stream', 272.4, 108),
  ('Deler overvann', 'Pakning 600 X-Stream', '3100678', 'pakning-600-x-stream', 325.4, 109),
  ('Deler overvann', 'Pakning 800 X-Stream', '3100679', 'pakning-800-x-stream', 822, 110),
  ('Deler overvann', 'Reduksjon 200/150 X-Stream', '3100607', 'reduksjon-200-150-x-stream', 609, 111),
  ('Deler avløp', 'Bend 125 mm 15° PP', '2252299', 'bend-125-mm-15gr-pp', 83.4, 101),
  ('Deler avløp', 'Bend 125 mm 45° PP', '2252309', 'bend-125-mm-45gr-pp', 83.4, 102),
  ('Deler avløp', 'Bend 250 mm 15° PP', '2252484', 'bend-250-mm-15gr-pp', 843.7, 103),
  ('Deler avløp', 'Bend 250 mm 30° PP', '2252494', 'bend-250-mm-30gr-pp', 867.3, 104),
  ('Deler avløp', 'Bend 250 mm 30° PP lang', '2251834', 'bend-250-mm-30gr-pp-lang', 2313.4, 105),
  ('Deler avløp', 'Bend 250 mm 45° PP', '2252499', 'bend-250-mm-45gr-pp', 908, 106),
  ('Deler avløp', 'Bend 315 mm 15° PP', '2252559', 'bend-315-mm-15gr-pp', 1308.3, 107),
  ('Deler avløp', 'Bend 315 mm 45° PP', '2252574', 'bend-315-mm-45gr-pp', 1829.7, 108),
  ('Deler avløp', 'Bend 400 mm 30° PP', '2252689', 'bend-400-mm-30gr-pp', 3900, 109),
  ('Deler avløp', 'Dobbelmuffe 250 mm PP grunnavløp', '2255044', 'dobbelmuffe-250-mm-pp-grunnavlop', 433.9, 110),
  ('Deler avløp', 'Dobbelmuffe 315 mm PP grunnavløp', '2255054', 'dobbelmuffe-315-mm-pp-grunnavlop', 889.1, 111),
  ('Deler avløp', 'Dobbelmuffe 400 mm PP grunnavløp', '2255064', 'dobbelmuffe-400-mm-pp-grunnavlop', 2175, 112),
  ('Deler avløp', 'Grenrør 160 x 125 mm PP', '2253049', 'grenror-160-x-125-mm-pp', 145.2, 113),
  ('Deler avløp', 'Grenrør 200 x 200 mm PP', '2253105', 'grenror-200-x-200-mm-pp', 738, 114),
  ('Deler avløp', 'Grenrør 250 x 160 mm PP', '2253159', 'grenror-250-x-160-mm-pp', 1701, 115),
  ('Deler avløp', 'Grenrør 315 x 160 mm PP', '2253239', 'grenror-315-x-160-mm-pp', 2241, 116),
  ('Deler avløp', 'Overgang 160x110 mm PP eksentrisk', '2255429', 'overgang-160x110-mm-pp-eksentrisk', 79, 117),
  ('Deler avløp', 'Overgang 315x250 mm PP eksentrisk', '2255534', 'overgang-315x250-mm-pp-eksentrisk', 1221, 118),
  ('PE-deler', 'Albue elektrosveis 50 mm 90°', '2462087', 'albue-elektrosveis-50-mm-90gr', 157.42, 101),
  ('PE-deler', 'Albue elektrosveis 63 mm 90°', '2462089', 'albue-elektrosveis-63-mm-90gr', 180.2, 102),
  ('PE-deler', 'Albue elektrosveis 90 mm 45°', '2462143', 'albue-elektrosveis-90-mm-45gr', 317.9, 103),
  ('PE-deler', 'Muffe 40 mm strekkfast PN16', '2537739', 'muffe-40-mm-strekkfast-pn16', 116.9, 104),
  ('PE-deler', 'Muffe 50 mm strekkfast PN16', '2537744', 'muffe-50-mm-strekkfast-pn16', 159.6, 105),
  ('PE-deler', 'Muffe elektrosveis 32 mm', '2462007', 'muffe-elektrosveis-32-mm', 50.66, 106),
  ('PE-deler', 'Muffe elektrosveis 50 mm', '2462012', 'muffe-elektrosveis-50-mm', 82.28, 107),
  ('PE-deler', 'Muffe elektrosveis 63 mm', '2462014', 'muffe-elektrosveis-63-mm', 86.36, 108),
  ('PE-deler', 'Støttehylse innvendig 160 SDR11', '2081974', 'stottehylse-innvendig-160-sdr11', 603.75, 109),
  ('PE-deler', 'Støttehylse innvendig 75 SDR11', '2081957', 'stottehylse-innvendig-75-sdr11', 332.5, 110),
  ('PE-deler', 'Støttehylse innvendig 90 SDR11', '2081961', 'stottehylse-innvendig-90-sdr11', 395.5, 111),
  ('PE-deler', 'T-rør 50 mm PN6/10 PRK', '2511244', 't-ror-50-mm-pn6-10-prk', 1001, 112),
  ('Innvendig avløp (Wafix)', 'Bend 110x15° sort Wafix PP', '2215329', 'bend-110x15gr-sort-wafix-pp', 65.45, 101),
  ('Innvendig avløp (Wafix)', 'Bend 110x30° sort Wafix PP', '2215332', 'bend-110x30gr-sort-wafix-pp', 65.45, 102),
  ('Innvendig avløp (Wafix)', 'Bend 110x45° sort Wafix PP', '2215334', 'bend-110x45gr-sort-wafix-pp', 65.45, 103),
  ('Innvendig avløp (Wafix)', 'Bend 110x88,5° sort Wafix PP', '2215338', 'bend-110x88-5gr-sort-wafix-pp', 71.75, 104),
  ('Innvendig avløp (Wafix)', 'Bend 15° 90 mm Wafix PP', '2214011', 'bend-15gr-90-mm-wafix-pp', 56.35, 105),
  ('Innvendig avløp (Wafix)', 'Bend 30° 90 mm Wafix PP', '2214012', 'bend-30gr-90-mm-wafix-pp', 56.35, 106),
  ('Innvendig avløp (Wafix)', 'Bend 75x30° sort Wafix PP', '2215331', 'bend-75x30gr-sort-wafix-pp', 42.9, 107),
  ('Innvendig avløp (Wafix)', 'Bend 75x45° sort Wafix PP', '2215333', 'bend-75x45gr-sort-wafix-pp', 42.9, 108),
  ('Innvendig avløp (Wafix)', 'Bend 75x88,5° sort Wafix PP', '2215337', 'bend-75x88-5gr-sort-wafix-pp', 45.5, 109),
  ('Innvendig avløp (Wafix)', 'Bend 90 mm x 45° PP Wafix sort', '2214837', 'bend-90-mm-x-45gr-pp-wafix-sort', 56, 110),
  ('Innvendig avløp (Wafix)', 'Bend sort 75x15° Wafix PP', '2215328', 'bend-sort-75x15gr-wafix-pp', 42.9, 111),
  ('Innvendig avløp (Wafix)', 'Dobbeltmuffe hvit 32 Wafix PP', '2214502', 'dobbeltmuffe-hvit-32-wafix-pp', 27.09, 112),
  ('Innvendig avløp (Wafix)', 'Dobbeltmuffe sort 75 mm Wafix PP', '2215324', 'dobbeltmuffe-sort-75-mm-wafix-pp', 36.75, 113),
  ('Innvendig avløp (Wafix)', 'Grenrør 75/75x45° sort Wafix PP', '2215343', 'grenror-75-75x45gr-sort-wafix-pp', 63, 114),
  ('Innvendig avløp (Wafix)', 'Løpemuffe 90 mm PP Wafix sort', '2214845', 'lopemuffe-90-mm-pp-wafix-sort', 65.8, 115),
  ('Innvendig avløp (Wafix)', 'Reduksjon 110/75 mm sort Wafix', '2215358', 'reduksjon-110-75-mm-sort-wafix', 46.55, 116),
  ('Innvendig avløp (Wafix)', 'Ters f/muffe 110 mm sort Wafix', '2215365', 'ters-f-muffe-110-mm-sort-wafix', 59.85, 117),
  ('Koblinger og kraner', 'Albue 32 mm 90° messing', '2561934', 'albue-32-mm-90gr-messing', 284, 101),
  ('Koblinger og kraner', 'Albue 40 mm 90° messing', '2561939', 'albue-40-mm-90gr-messing', 600.25, 102),
  ('Koblinger og kraner', 'Bakkekran til PE-rør, 63mm, messing', '3383328', 'bakkekran-til-pe-ror-63mm-messing', 3013.5, 103),
  ('Koblinger og kraner', 'Bakkekran til PE-rør, messing', '3383324', 'bakkekran-til-pe-ror-messing', 1634.5, 104),
  ('Koblinger og kraner', 'Bakkekran til PE-rør, Ø63 mm, messing', '3383419', 'bakkekran-til-pe-ror-o63-mm-messing', 2887.5, 105),
  ('Koblinger og kraner', 'Flexi adapter 20-27 x 25', '2564202', 'flexi-adapter-20-27-x-25', 309.75, 106),
  ('Koblinger og kraner', 'Flexi adapter 27-35 x 25', '2564203', 'flexi-adapter-27-35-x-25', 374.5, 107),
  ('Koblinger og kraner', 'Isiflo sprint tippunion 32 x 3/4"', '2569664', 'isiflo-sprint-tippunion-32-x-3-4', 85.4, 108),
  ('Koblinger og kraner', 'Isiflo sprint tippunion 50x1.1/2"', '2569662', 'isiflo-sprint-tippunion-50x1-1-2', 185.1, 109),
  ('Koblinger og kraner', 'Isiflo sprint union 40 x 40 mm', '2569654', 'isiflo-sprint-union-40-x-40-mm', 243.9, 110),
  ('Koblinger og kraner', 'Isiflo sprint union 40 x1.1/4"', '2569673', 'isiflo-sprint-union-40-x1-1-4', 204.75, 111),
  ('Koblinger og kraner', 'Isiflo sprint union 50 x1.1/2"', '2569674', 'isiflo-sprint-union-50-x1-1-2', 248.5, 112),
  ('Koblinger og kraner', 'Plugg Isiflo 32 nr 145', '2563234', 'plugg-isiflo-32-nr-145', 114.45, 113),
  ('Koblinger og kraner', 'Plugg Isiflo 40 nr 145', '2563239', 'plugg-isiflo-40-nr-145', 161.35, 114),
  ('Koblinger og kraner', 'Reduksjonsinnlegg Isiflo 32 x 25', '2562834', 'reduksjonsinnlegg-isiflo-32-x-25', 190.75, 115),
  ('Koblinger og kraner', 'Reduksjonsinnlegg Isiflo 40 x 32', '2562839', 'reduksjonsinnlegg-isiflo-40-x-32', 239.75, 116),
  ('Koblinger og kraner', 'Reduksjonsinnlegg Isiflo 50 x 40', '2562844', 'reduksjonsinnlegg-isiflo-50-x-40', 308, 117),
  ('Koblinger og kraner', 'Reduksjonsinnlegg Isiflo 63 x 50', '2561178', 'reduksjonsinnlegg-isiflo-63-x-50', 523.25, 118),
  ('Koblinger og kraner', 'T-rør m/3 kpl. Isiflo 32', '2562434', 't-ror-m-3-kpl-isiflo-32', 433.6, 119),
  ('Koblinger og kraner', 'T-rør m/3 kpl. Isiflo 40', '2562439', 't-ror-m-3-kpl-isiflo-40', 708.4, 120),
  ('Koblinger og kraner', 'T-rør m/3 kpl. Isiflo 50', '2562444', 't-ror-m-3-kpl-isiflo-50', 1003.8, 121),
  ('Koblinger og kraner', 'T-rør m/3 kpl. Isiflo 63', '2561173', 't-ror-m-3-kpl-isiflo-63', 1462.2, 122),
  ('Koblinger og kraner', 'Tippunion Isiflo 32 x 3/4"', '2561534', 'tippunion-isiflo-32-x-3-4', 290.5, 123),
  ('Koblinger og kraner', 'Tippunion Isiflo 75 x 2.1/2-2"', '2561459', 'tippunion-isiflo-75-x-2-1-2-2', 1907.5, 124),
  ('Koblinger og kraner', 'Tippunion iJoint 75-2 1/2"PN16', '2538527', 'tippunion-ijoint-75-2-1-2-pn16', 269.5, 125),
  ('Messingdeler', 'Albue messing 1 1/2" R', '5020108', 'albue-messing-1-1-2-r', 279.72, 101),
  ('Messingdeler', 'Albue messing 1 1/4" R', '5020107', 'albue-messing-1-1-4-r', 139.1, 102),
  ('Messingdeler', 'Albue messing 1" R', '5020106', 'albue-messing-1-r', 76.73, 103),
  ('Messingdeler', 'Albue messing 3/4" R', '5020105', 'albue-messing-3-4-r', 56.32, 104),
  ('Messingdeler', 'Ansatsnippel messing 1 1/2" R', '5020378', 'ansatsnippel-messing-1-1-2-r', 78.25, 105),
  ('Messingdeler', 'Ansatsnippel messing 1 1/4" R', '5020377', 'ansatsnippel-messing-1-1-4-r', 57.08, 106),
  ('Messingdeler', 'Ansatsnippel messing 1" R', '5020376', 'ansatsnippel-messing-1-r', 39.69, 107),
  ('Messingdeler', 'Ansatsnippel messing 2" R', '5020379', 'ansatsnippel-messing-2-r', 125.87, 108),
  ('Messingdeler', 'Ansatsnippel messing 3/4" R', '5020375', 'ansatsnippel-messing-3-4-r', 24.04, 109),
  ('Messingdeler', 'Kappe messing 1 1/2" R', '5020158', 'kappe-messing-1-1-2-r', 131.17, 110),
  ('Messingdeler', 'Kappe messing 1 1/4" R', '5020157', 'kappe-messing-1-1-4-r', 99.79, 111),
  ('Messingdeler', 'Kappe messing 1" R', '5020156', 'kappe-messing-1-r', 53.68, 112),
  ('Messingdeler', 'Kappe messing 2" R', '5020259', 'kappe-messing-2-r', 194.67, 113),
  ('Messingdeler', 'Kappe messing 3/4" R', '5020255', 'kappe-messing-3-4-r', 37.69, 114),
  ('Messingdeler', 'Muffe messing 1 1/2" R', '5020298', 'muffe-messing-1-1-2-r', 131.17, 115),
  ('Messingdeler', 'Muffe messing 1 1/4" R', '5020297', 'muffe-messing-1-1-4-r', 106.22, 116),
  ('Messingdeler', 'Muffe messing 1" R', '5020296', 'muffe-messing-1-r', 57.83, 117),
  ('Messingdeler', 'Muffe messing 2" R', '5020299', 'muffe-messing-2-r', 245.7, 118),
  ('Messingdeler', 'Muffe messing 3/4" R', '5020295', 'muffe-messing-3-4-r', 35.23, 119),
  ('Messingdeler', 'Nippelmuffe messing 1 1/2" R', '5020338', 'nippelmuffe-messing-1-1-2-r', 117.94, 120),
  ('Messingdeler', 'Nippelmuffe messing 1 1/4" R', '5020337', 'nippelmuffe-messing-1-1-4-r', 87.32, 121),
  ('Messingdeler', 'Nippelmuffe messing 1"x1 1/4"', '5020363', 'nippelmuffe-messing-1-x1-1-4', 105.46, 122),
  ('Messingdeler', 'Nippelmuffe messing 3/4" R', '5020335', 'nippelmuffe-messing-3-4-r', 37.69, 123),
  ('Messingdeler', 'Overgang ansatsnippel 1 1/2"x 1"', '5020404', 'overgang-ansatsnippel-1-1-2-x-1', 97.9, 124),
  ('Messingdeler', 'Overgang ansatsnippel 1 1/2"x 3/4"', '5020403', 'overgang-ansatsnippel-1-1-2-x-3-4', 110, 125),
  ('Messingdeler', 'Overgang ansatsnippel 1 1/2"x1 1/4"', '5020405', 'overgang-ansatsnippel-1-1-2-x1-1-4', 89.59, 126),
  ('Messingdeler', 'Overgang ansatsnippel 1 1/4"x 3/4"', '5020401', 'overgang-ansatsnippel-1-1-4-x-3-4', 75.98, 127),
  ('Messingdeler', 'Overgang ansatsnippel 1"x 1/2"', '5020398', 'overgang-ansatsnippel-1-x-1-2', 48.01, 128),
  ('Messingdeler', 'Overgang ansatsnippel 1"x 3/4"', '5020399', 'overgang-ansatsnippel-1-x-3-4', 48.01, 129),
  ('Messingdeler', 'Overgang ansatsnippel 2"x 1"', '5020406', 'overgang-ansatsnippel-2-x-1', 175.39, 130),
  ('Messingdeler', 'Overgang ansatsnippel 2"x1 1/2"', '5020408', 'overgang-ansatsnippel-2-x1-1-2', 150.44, 131),
  ('Messingdeler', 'Overgang ansatsnippel 2"x1 1/4"', '5020407', 'overgang-ansatsnippel-2-x1-1-4', 153.85, 132),
  ('Messingdeler', 'Overgang ansatsnippel 3/4"x 1/2"', '5020397', 'overgang-ansatsnippel-3-4-x-1-2', 34.13, 133),
  ('Messingdeler', 'Overgangsmuffe 1 1/2" R x 1 1/4" R', '5020325', 'overgangsmuffe-1-1-2-r-x-1-1-4-r', 146.66, 134),
  ('Messingdeler', 'Overgangsmuffe 1 1/2" R x 1" R', '5020324', 'overgangsmuffe-1-1-2-r-x-1-r', 124.74, 135),
  ('Messingdeler', 'Overgangsmuffe 1 1/4" R x 1" R', '5020323', 'overgangsmuffe-1-1-4-r-x-1-r', 107.73, 136),
  ('Messingdeler', 'Overgangsmuffe 1 1/4" R x 3/4" R', '5020322', 'overgangsmuffe-1-1-4-r-x-3-4-r', 103.19, 137),
  ('Messingdeler', 'Overgangsmuffe 1" R x 3/4" R', '5020321', 'overgangsmuffe-1-r-x-3-4-r', 72.58, 138),
  ('Messingdeler', 'Overgangsmuffe 2" R x 1 1/2" R', '5020327', 'overgangsmuffe-2-r-x-1-1-2-r', 292.95, 139),
  ('Messingdeler', 'Overgangsmuffe 2" R x 1 1/4" R', '5020326', 'overgangsmuffe-2-r-x-1-1-4-r', 292.95, 140),
  ('Messingdeler', 'Overgangsnippel 1 1/2"x 1"', '5020439', 'overgangsnippel-1-1-2-x-1', 80.51, 141),
  ('Messingdeler', 'Overgangsnippel 1 1/2"x 3/4"', '5020438', 'overgangsnippel-1-1-2-x-3-4', 80.51, 142),
  ('Messingdeler', 'Overgangsnippel 1 1/4"x 3/4"', '5020435', 'overgangsnippel-1-1-4-x-3-4', 66.15, 143),
  ('Messingdeler', 'Overgangsnippel 2 1/2"x 2"', '5020446', 'overgangsnippel-2-1-2-x-2', 194.67, 144),
  ('Messingdeler', 'Overgangsnippel 2"x 1"', '5020442', 'overgangsnippel-2-x-1', 125.87, 145),
  ('Messingdeler', 'Overgangsnippel 2"x1 1/2"', '5020444', 'overgangsnippel-2-x1-1-2', 125.87, 146),
  ('Messingdeler', 'Overgangsnippel 2"x1 1/4"', '5020443', 'overgangsnippel-2-x1-1-4', 125.87, 147),
  ('Messingdeler', 'Overgangsnippel 3/4"x 1/2"', '5020429', 'overgangsnippel-3-4-x-1-2', 19.77, 148),
  ('Messingdeler', 'Plugg messing 1 1/2" R', '5020488', 'plugg-messing-1-1-2-r', 91.85, 149),
  ('Messingdeler', 'Plugg messing 1 1/4" R', '5020487', 'plugg-messing-1-1-4-r', 60.1, 150),
  ('Messingdeler', 'Plugg messing 1" R', '5020486', 'plugg-messing-1-r', 42.34, 151),
  ('Messingdeler', 'Plugg messing 3/4" R', '5020485', 'plugg-messing-3-4-r', 34.13, 152),
  ('Messingdeler', 'T-rør messing 1 1/4" R', '5020507', 't-ror-messing-1-1-4-r', 182.2, 153),
  ('Messingdeler', 'T-rør messing 2" R', '5020509', 't-ror-messing-2-r', 485.73, 154),
  ('Ventiler og vannverk', 'Anboringsklammer 110 x 1" AVK', '3326979', 'anboringsklammer-110-x-1-avk', 798, 101),
  ('Ventiler og vannverk', 'Anboringsklammer 160 x 1" AVK', '3326993', 'anboringsklammer-160-x-1-avk', 1452.5, 102),
  ('Ventiler og vannverk', 'Anboringsklammer 160 x 2" AVK', '3327003', 'anboringsklammer-160-x-2-avk', 1452.5, 103),
  ('Ventiler og vannverk', 'Anboringsklammer 63 x 1.1/2" AVK', '3326956', 'anboringsklammer-63-x-1-1-2-avk', 607.25, 104),
  ('Ventiler og vannverk', 'Anboringsklammer 75 x 1" AVK', '3326959', 'anboringsklammer-75-x-1-avk', 677.25, 105),
  ('Ventiler og vannverk', 'Anboringsklammer 90 x 1" AVK', '3326969', 'anboringsklammer-90-x-1-avk', 677.25, 106),
  ('Ventiler og vannverk', 'Anboringssperre ZAK46 spiss/muffe', '2070192', 'anboringssperre-zak46-spiss-muffe', 2557.4, 107),
  ('Ventiler og vannverk', 'Blindflens (X), DN100 PN10/16', '2041008', 'blindflens-x-dn100-pn10-16', 408.5, 108),
  ('Ventiler og vannverk', 'Blindplugg ZAK46', '2070122', 'blindplugg-zak46', 393.3, 109),
  ('Ventiler og vannverk', 'Brannventil DN100 mm', '5577709', 'brannventil-dn100-mm', 2593.5, 110),
  ('Ventiler og vannverk', 'Flense t-rør 100 duktilt', '2041919', 'flense-t-ror-100-duktilt', 1854.4, 111),
  ('Ventiler og vannverk', 'Flense t-rør 150 duktilt', '2041929', 'flense-t-ror-150-duktilt', 2477.6, 112),
  ('Ventiler og vannverk', 'Kuleventil 1 1/2" avstengingsfri, m/hendel', '5600916', 'kuleventil-1-1-2-avstengingsfri-m-hendel', 560.8, 113),
  ('Ventiler og vannverk', 'Kuleventil 1" avstengingsfri, m/hendel', '5600912', 'kuleventil-1-avstengingsfri-m-hendel', 232.5, 114),
  ('Ventiler og vannverk', 'Mellomring 150 - 1.1/2" S-1450', '5635613', 'mellomring-150-1-1-2-s-1450', 1493.4, 115),
  ('Ventiler og vannverk', 'Mellomring, DN200', '5636684', 'mellomring-dn200', 3321.2, 116),
  ('Ventiler og vannverk', 'Muffesikring, DN100/Ø110', '2071606', 'muffesikring-dn100-o110', 1227.4, 117),
  ('Ventiler og vannverk', 'Nøkkeltopp høyre 100/150 AVK', '5510839', 'nokkeltopp-hoyre-100-150-avk', 203, 118),
  ('Ventiler og vannverk', 'Ratt 100-150 for sluseventil', '5502009', 'ratt-100-150-for-sluseventil', 666.75, 119),
  ('Ventiler og vannverk', 'Sluseventil DN50 epoxy PN16', '5513622', 'sluseventil-dn50-epoxy-pn16', 2275.4, 120),
  ('Ventiler og vannverk', 'Sluseventil, DN100, HL, PN16', '5510039', 'sluseventil-dn100-hl-pn16', 4165, 121),
  ('Ventiler og vannverk', 'Spindelforlenger, teleskop', '3354623', 'spindelforlenger-teleskop-3354623', 1386, 122),
  ('Ventiler og vannverk', 'Spindelforlenger, teleskop', '3354723', 'spindelforlenger-teleskop-3354723', 1701, 123),
  ('Ventiler og vannverk', 'Sveiseflens plan DN150/168,3', '1901375', 'sveiseflens-plan-dn150-168-3', 1128.5, 124),
  ('Ventiler og vannverk', 'Tippunion ZAK 46x32 mm', '2070136', 'tippunion-zak-46x32-mm', 289.5, 125),
  ('Ventiler og vannverk', 'Ventil-X, DN100, HL, PN16', '5508676', 'ventil-x-dn100-hl-pn16', 32882.5, 126),
  ('Kummer og lokk', 'Kjegle 1600x1000 mm Premod', '2189315', 'kjegle-1600x1000-mm-premod', 6579.4, 101),
  ('Kummer og lokk', 'Kjegle IG-T 1200x650x600 mm', '2181317', 'kjegle-ig-t-1200x650x600-mm', 7202.5, 102),
  ('Kummer og lokk', 'Kumgjennomføring 150 mm F-930', '2108392', 'kumgjennomforing-150-mm-f-930', 437.5, 103),
  ('Kummer og lokk', 'Kumgjennomføring 911 OD105-175', '2108506', 'kumgjennomforing-911-od105-175', 794.5, 104),
  ('Kummer og lokk', 'Kumgjennomføring F910 110', '2108406', 'kumgjennomforing-f910-110', 156.8, 105),
  ('Kummer og lokk', 'Kumgjennomføring F910 160', '2108413', 'kumgjennomforing-f910-160', 185.5, 106),
  ('Kummer og lokk', 'Kumgjennomføring F910 200', '2108416', 'kumgjennomforing-f910-200', 199.5, 107),
  ('Kummer og lokk', 'Kumgjennomføring F910 250', '2108423', 'kumgjennomforing-f910-250', 264.25, 108),
  ('Kummer og lokk', 'Kumgjennomføring F910 400', '2108428', 'kumgjennomforing-f910-400', 467.25, 109),
  ('Kummer og lokk', 'Kumgjennomføring F911 200-280', '2108509', 'kumgjennomforing-f911-200-280', 1179.5, 110),
  ('Kummer og lokk', 'Kumlokk og ramme Ø315 D400', '3237163', 'kumlokk-og-ramme-o315-d400', 1320, 111),
  ('Kummer og lokk', 'Kumlokk og ramme Ø650 flytende D400', '3237651', 'kumlokk-og-ramme-o650-flytende-d400', 2508, 112),
  ('Kummer og lokk', 'Kumring IG-T 1200x300 mm', '2181292', 'kumring-ig-t-1200x300-mm', 5654.8, 113),
  ('Kummer og lokk', 'Kumring IG-T 1600x300 mm', '2181298', 'kumring-ig-t-1600x300-mm', 8844, 114),
  ('Kummer og lokk', 'Kumring IG-T 1600x500 mm', '2181299', 'kumring-ig-t-1600x500-mm', 8844, 115),
  ('Kummer og lokk', 'Kumring IG-T 2000x500 mm', '2181303', 'kumring-ig-t-2000x500-mm', 12495.5, 116),
  ('Kummer og lokk', 'Kuppelrist 650/640 lav', '3300513', 'kuppelrist-650-640-lav', 1688.5, 117),
  ('Kummer og lokk', 'Rennestens ramme/rist, for Ø400', '3300732', 'rennestens-ramme-rist-for-o400', 2376, 118),
  ('Kummer og lokk', 'Ristlokk URL 650 (NSRL)', '3302402', 'ristlokk-url-650-nsrl', 3030.5, 119),
  ('Kummer og lokk', 'Spyle-/inspeksjonskum 110x315 rettløp', '3222705', 'spyle-inspeksjonskum-110x315-rettlop', 1806, 120),
  ('Kummer og lokk', 'Spyle-/inspeksjonskum 160x315 høy/ven', '3222723', 'spyle-inspeksjonskum-160x315-hoy-ven', 3174, 121),
  ('Kummer og lokk', 'Spylekum dobbel gren PE 315', '3222269', 'spylekum-dobbel-gren-pe-315', 16650, 122),
  ('Kummer og lokk', 'Støttering, Ø650 mm', '9821417', 'stottering-o650-mm', 271.7, 123),
  ('Kummer og lokk', 'Teleskoprør 315x375 mm', '3356834', 'teleskopror-315x375-mm', 630, 124),
  ('Kummer og lokk', 'Teleskoptopp 160 mm rundt lokk', '3220697', 'teleskoptopp-160-mm-rundt-lokk', 1872.1, 125),
  ('Diverse', 'Boltesett M16x130 VZ kval. 8.8 (eske)', '3521713', 'boltesett-m16x130-vz-kval-8-8-eske', 198.93, 101),
  ('Diverse', 'Boltesett M20x75 VZ kval. 8.8 (eske)', '3521005', 'boltesett-m20x75-vz-kval-8-8-eske', 230.85, 102),
  ('Diverse', 'Gjengestag M12 x 1000 mm VZ 8.8', '3476769', 'gjengestag-m12-x-1000-mm-vz-8-8', 54.26, 103),
  ('Diverse', 'Kobbertråd KGF (7*2,24) trommel 500 m', '3025979', 'kobbertrad-kgf-7-2-24-trommel-500-m', 31400, 104),
  ('Diverse', 'Rørskjøt fiberrør DBS 14 mm', '3113766', 'rorskjot-fiberror-dbs-14-mm', 80.96, 105),
  ('Diverse', 'Sekskantskrue syrefast M16 x 60 A4', '3521354', 'sekskantskrue-syrefast-m16-x-60-a4', 25.25, 106),
  ('Diverse', 'Superglideks m/silikon 400g (flaske)', '9507871', 'superglideks-m-silikon-400g-flaske', 158.46, 107);

insert into public.pipe_categories (name, color, sort_order)
select v.name, v.color, v.sort_order
from (values
  ('PVC trykkrør', '#7a4f9f', 9),
  ('Kabelrør', '#c0392b', 10),
  ('Innvendig avløp (Wafix)', '#3a3a3a', 11),
  ('Messingdeler', '#b8860b', 12),
  ('Ventiler og vannverk', '#1f6f6f', 13),
  ('Kummer og lokk', '#6b5b4b', 14),
  ('Diverse', '#808080', 15)
) as v(name, color, sort_order)
where not exists (select 1 from public.pipe_types p join _telleliste_2025 t on t.sku = p.sku)
on conflict (name) do nothing;

insert into public.pipe_types
  (category_id, name, dimension, sku, qr_slug, unit, cost_price, price, stock, low_stock_threshold, sort_order)
select
  (select id from public.pipe_categories c where c.name = t.kategori),
  t.name, null, t.sku, t.qr_slug, 'stk', t.cost,
  round(t.cost * (1 + coalesce((select markup_percent from public.pipe_settings where id = 1), 25) / 100), 2),
  0, 0, t.sort_order
from _telleliste_2025 t
where not exists (select 1 from public.pipe_types p join _telleliste_2025 t2 on t2.sku = p.sku)
on conflict do nothing;

drop table _telleliste_2025;
