-- Dimensjonen inn i eige felt på varene som berre hadde ho i namnet.
--
-- Varene frå tellelista og hylleetikettane (20261014220000 og seinare) fekk
-- namn som «Bend 250 mm 45° PP» utan dimensjon. Dahl-katalogen har ho i eige
-- felt, og etikettane i QR Admin viser difor «DIMENSJON 150 mm» på dei gamle
-- og ingenting på dei nye. No står ho begge stader, som på dei andre:
-- namna er urørte, og appen hengjer ikkje dimensjonen bak eit namn som alt
-- har henne (pipeLabel i src/lib/format.ts).
--
-- Det første talet i namnet er som regel dimensjonen. Lista er gått gjennom
-- for hand: Isiflo-koplingar har rørdimensjonen, ventilar og flensar DN,
-- kumgjennomføringar måleområdet. Bolter, glidemiddel, kobbertråd og liknande
-- (Diverse) og varer utan mål står utan.
--
-- Berre der feltet er tomt: ein dimensjon kontoret har sett, blir ikkje
-- skriven over, og ei omkøyring gjer ingenting.

update public.pipe_types t
set dimension = d.dimensjon
from (values
  ('3074509', '110/97 mm'), -- Overvannsrør Pragma 110/97-6m sort
  ('3074524', '160/139 mm'), -- Overvannsrør Pragma 160/139-6m sort
  ('3074534', '200/174 mm'), -- Overvannsrør Pragma 200/174-6m sort
  ('3074973', '300 mm'), -- Overvannsrør Pragma Infra 300-6m
  ('3074974', '400 mm'), -- Overvannsrør Pragma Infra 400-6m
  ('3023751', '110 mm'), -- Rør overvann 110 mm sort PP
  ('3023753', '160 mm'), -- Rør overvann 160 mm sort PP
  ('3023754', '200 mm'), -- Rør overvann 200 mm sort PP
  ('3100516', '800 mm'), -- Rør overvann 800 X-Stream 6 m
  ('3080809', '400 mm'), -- Stigerør Pragma spillvann 400-6m RB
  ('3070809', '110/97 mm'), -- Drensrør Pragma toppslisset 110/97 6 m
  ('2395159', '110 mm'), -- Rør 110 mm PE100 SDR17 6 m
  ('2395162', '160 mm'), -- Rør 160 mm PE100 SDR17 6 m
  ('2395163', '200 mm'), -- Rør 200 mm PE100 SDR17 6 m
  ('2395108', '32 mm'), -- Rør 32 mm PE100 SDR11 PN10
  ('2395111', '50 mm'), -- Rør 50 mm PE100 SDR11 PN10
  ('3100662', '150 mm'), -- Løpemuffe 150 X-Stream
  ('3100671', '100 mm'), -- Pakning 100 X-Stream
  ('3100672', '150 mm'), -- Pakning 150 X-Stream
  ('3100673', '200 mm'), -- Pakning 200 X-Stream
  ('3100674', '250 mm'), -- Pakning 250 X-Stream
  ('3100675', '300 mm'), -- Pakning 300 X-Stream
  ('3100676', '400 mm'), -- Pakning 400 X-Stream
  ('3100677', '500 mm'), -- Pakning 500 X-Stream
  ('3100678', '600 mm'), -- Pakning 600 X-Stream
  ('3100679', '800 mm'), -- Pakning 800 X-Stream
  ('3100607', '200/150 mm'), -- Reduksjon 200/150 X-Stream
  ('2252299', '125 mm'), -- Bend 125 mm 15° PP
  ('2252309', '125 mm'), -- Bend 125 mm 45° PP
  ('2252484', '250 mm'), -- Bend 250 mm 15° PP
  ('2252494', '250 mm'), -- Bend 250 mm 30° PP
  ('2251834', '250 mm'), -- Bend 250 mm 30° PP lang
  ('2252499', '250 mm'), -- Bend 250 mm 45° PP
  ('2252559', '315 mm'), -- Bend 315 mm 15° PP
  ('2252574', '315 mm'), -- Bend 315 mm 45° PP
  ('2252689', '400 mm'), -- Bend 400 mm 30° PP
  ('2255044', '250 mm'), -- Dobbelmuffe 250 mm PP grunnavløp
  ('2255054', '315 mm'), -- Dobbelmuffe 315 mm PP grunnavløp
  ('2255064', '400 mm'), -- Dobbelmuffe 400 mm PP grunnavløp
  ('2253049', '160x125 mm'), -- Grenrør 160 x 125 mm PP
  ('2253105', '200x200 mm'), -- Grenrør 200 x 200 mm PP
  ('2253159', '250x160 mm'), -- Grenrør 250 x 160 mm PP
  ('2253239', '315x160 mm'), -- Grenrør 315 x 160 mm PP
  ('2255429', '160x110 mm'), -- Overgang 160x110 mm PP eksentrisk
  ('2255534', '315x250 mm'), -- Overgang 315x250 mm PP eksentrisk
  ('2255459', '200x160 mm'), -- Overgang grunnavløp 200x160 plast
  ('2462087', '50 mm'), -- Albue elektrosveis 50 mm 90°
  ('2462089', '63 mm'), -- Albue elektrosveis 63 mm 90°
  ('2462143', '90 mm'), -- Albue elektrosveis 90 mm 45°
  ('2537739', '40 mm'), -- Muffe 40 mm strekkfast PN16
  ('2537744', '50 mm'), -- Muffe 50 mm strekkfast PN16
  ('2462007', '32 mm'), -- Muffe elektrosveis 32 mm
  ('2462012', '50 mm'), -- Muffe elektrosveis 50 mm
  ('2462014', '63 mm'), -- Muffe elektrosveis 63 mm
  ('2081974', '160 mm'), -- Støttehylse innvendig 160 SDR11
  ('2081957', '75 mm'), -- Støttehylse innvendig 75 SDR11
  ('2081961', '90 mm'), -- Støttehylse innvendig 90 SDR11
  ('2511244', '50 mm'), -- T-rør 50 mm PN6/10 PRK
  ('2561934', '32 mm'), -- Albue 32 mm 90° messing
  ('2561939', '40 mm'), -- Albue 40 mm 90° messing
  ('3383328', '63 mm'), -- Bakkekran til PE-rør, 63mm, messing
  ('3383419', '63 mm'), -- Bakkekran til PE-rør, Ø63 mm, messing
  ('2564202', '20-27 mm'), -- Flexi adapter 20-27 x 25
  ('2564203', '27-35 mm'), -- Flexi adapter 27-35 x 25
  ('2569664', '32 mm'), -- Isiflo sprint tippunion 32 x 3/4"
  ('2569662', '50 mm'), -- Isiflo sprint tippunion 50x1.1/2"
  ('2569654', '40 mm'), -- Isiflo sprint union 40 x 40 mm
  ('2569673', '40 mm'), -- Isiflo sprint union 40 x1.1/4"
  ('2569674', '50 mm'), -- Isiflo sprint union 50 x1.1/2"
  ('2563234', '32 mm'), -- Plugg Isiflo 32 nr 145
  ('2563239', '40 mm'), -- Plugg Isiflo 40 nr 145
  ('2562834', '32x25 mm'), -- Reduksjonsinnlegg Isiflo 32 x 25
  ('2562839', '40x32 mm'), -- Reduksjonsinnlegg Isiflo 40 x 32
  ('2562844', '50x40 mm'), -- Reduksjonsinnlegg Isiflo 50 x 40
  ('2561178', '63x50 mm'), -- Reduksjonsinnlegg Isiflo 63 x 50
  ('2562434', '32 mm'), -- T-rør m/3 kpl. Isiflo 32
  ('2562439', '40 mm'), -- T-rør m/3 kpl. Isiflo 40
  ('2562444', '50 mm'), -- T-rør m/3 kpl. Isiflo 50
  ('2561173', '63 mm'), -- T-rør m/3 kpl. Isiflo 63
  ('2561534', '32 mm'), -- Tippunion Isiflo 32 x 3/4"
  ('2561459', '75 mm'), -- Tippunion Isiflo 75 x 2.1/2-2"
  ('2538527', '75 mm'), -- Tippunion iJoint 75-2 1/2"PN16
  ('2351824', '110 mm'), -- Bend 110 mm 11° PVC m/1 muffe
  ('2351849', '110 mm'), -- Bend 110 mm 90° PVC m/1 muffe
  ('2351859', '160 mm'), -- Bend 160 mm 22° PVC m/1 muffe
  ('2351864', '160 mm'), -- Bend 160 mm 30° PVC m/1 muffe
  ('2350449', '110 mm'), -- Trykkrør 110 mm PVC PN12,5
  ('2350459', '160 mm'), -- Trykkrør 160 mm PVC PN12,5
  ('2350494', '315 mm'), -- Trykkrør 315 mm PVC PN12,5
  ('3025867', '110 mm'), -- Kabelbend 110 mm 15° R2000 rød
  ('3025889', '75 mm'), -- Kabelbend 75 mm 30° R600 rød
  ('3025861', '110 mm'), -- Kabelrør 110 mm gul PP
  ('3026021', '110 mm'), -- Kabelrør 110 mm kveil rød DV
  ('3025856', '110 mm'), -- Kabelrør 110 mm rød PP
  ('3025863', '160 mm'), -- Kabelrør 160 mm rød PP
  ('3026035', '3*40 mm'), -- Kabelrør 3*40 mm gul DL (trommel)
  ('3110119', '33/40 mm'), -- Kabelrør 33/40 mm gul GL à 150 m (kveil)
  ('3025854', '75 mm'), -- Kabelrør 75 mm rød PP
  ('2215329', '110 mm'), -- Bend 110x15° sort Wafix PP
  ('2215332', '110 mm'), -- Bend 110x30° sort Wafix PP
  ('2215334', '110 mm'), -- Bend 110x45° sort Wafix PP
  ('2215338', '110 mm'), -- Bend 110x88,5° sort Wafix PP
  ('2214011', '90 mm'), -- Bend 15° 90 mm Wafix PP
  ('2214012', '90 mm'), -- Bend 30° 90 mm Wafix PP
  ('2215331', '75 mm'), -- Bend 75x30° sort Wafix PP
  ('2215333', '75 mm'), -- Bend 75x45° sort Wafix PP
  ('2215337', '75 mm'), -- Bend 75x88,5° sort Wafix PP
  ('2214837', '90 mm'), -- Bend 90 mm x 45° PP Wafix sort
  ('2215328', '75 mm'), -- Bend sort 75x15° Wafix PP
  ('2214502', '32 mm'), -- Dobbeltmuffe hvit 32 Wafix PP
  ('2215324', '75 mm'), -- Dobbeltmuffe sort 75 mm Wafix PP
  ('2215343', '75 mm'), -- Grenrør 75/75x45° sort Wafix PP
  ('2214845', '90 mm'), -- Løpemuffe 90 mm PP Wafix sort
  ('2215358', '110/75 mm'), -- Reduksjon 110/75 mm sort Wafix
  ('2215327', '110 mm'), -- Løpemuffe 110 mm PP Wafix sort
  ('2215365', '110 mm'), -- Ters f/muffe 110 mm sort Wafix
  ('5020108', '1 1/2" R'), -- Albue messing 1 1/2" R
  ('5020107', '1 1/4" R'), -- Albue messing 1 1/4" R
  ('5020106', '1" R'), -- Albue messing 1" R
  ('5020105', '3/4" R'), -- Albue messing 3/4" R
  ('5020378', '1 1/2" R'), -- Ansatsnippel messing 1 1/2" R
  ('5020377', '1 1/4" R'), -- Ansatsnippel messing 1 1/4" R
  ('5020376', '1" R'), -- Ansatsnippel messing 1" R
  ('5020379', '2" R'), -- Ansatsnippel messing 2" R
  ('5020375', '3/4" R'), -- Ansatsnippel messing 3/4" R
  ('5020158', '1 1/2" R'), -- Kappe messing 1 1/2" R
  ('5020157', '1 1/4" R'), -- Kappe messing 1 1/4" R
  ('5020156', '1" R'), -- Kappe messing 1" R
  ('5020259', '2" R'), -- Kappe messing 2" R
  ('5020255', '3/4" R'), -- Kappe messing 3/4" R
  ('5020298', '1 1/2" R'), -- Muffe messing 1 1/2" R
  ('5020297', '1 1/4" R'), -- Muffe messing 1 1/4" R
  ('5020296', '1" R'), -- Muffe messing 1" R
  ('5020299', '2" R'), -- Muffe messing 2" R
  ('5020295', '3/4" R'), -- Muffe messing 3/4" R
  ('5020338', '1 1/2" R'), -- Nippelmuffe messing 1 1/2" R
  ('5020337', '1 1/4" R'), -- Nippelmuffe messing 1 1/4" R
  ('5020363', '1"x1 1/4"'), -- Nippelmuffe messing 1"x1 1/4"
  ('5020335', '3/4" R'), -- Nippelmuffe messing 3/4" R
  ('5020404', '1 1/2"x 1"'), -- Overgang ansatsnippel 1 1/2"x 1"
  ('5020403', '1 1/2"x 3/4"'), -- Overgang ansatsnippel 1 1/2"x 3/4"
  ('5020405', '1 1/2"x1 1/4"'), -- Overgang ansatsnippel 1 1/2"x1 1/4"
  ('5020401', '1 1/4"x 3/4"'), -- Overgang ansatsnippel 1 1/4"x 3/4"
  ('5020398', '1"x 1/2"'), -- Overgang ansatsnippel 1"x 1/2"
  ('5020399', '1"x 3/4"'), -- Overgang ansatsnippel 1"x 3/4"
  ('5020406', '2"x 1"'), -- Overgang ansatsnippel 2"x 1"
  ('5020408', '2"x1 1/2"'), -- Overgang ansatsnippel 2"x1 1/2"
  ('5020407', '2"x1 1/4"'), -- Overgang ansatsnippel 2"x1 1/4"
  ('5020397', '3/4"x 1/2"'), -- Overgang ansatsnippel 3/4"x 1/2"
  ('5020325', '1 1/2" R x 1 1/4" R'), -- Overgangsmuffe 1 1/2" R x 1 1/4" R
  ('5020324', '1 1/2" R x 1" R'), -- Overgangsmuffe 1 1/2" R x 1" R
  ('5020323', '1 1/4" R x 1" R'), -- Overgangsmuffe 1 1/4" R x 1" R
  ('5020322', '1 1/4" R x 3/4" R'), -- Overgangsmuffe 1 1/4" R x 3/4" R
  ('5020321', '1" R x 3/4" R'), -- Overgangsmuffe 1" R x 3/4" R
  ('5020327', '2" R x 1 1/2" R'), -- Overgangsmuffe 2" R x 1 1/2" R
  ('5020326', '2" R x 1 1/4" R'), -- Overgangsmuffe 2" R x 1 1/4" R
  ('5020439', '1 1/2"x 1"'), -- Overgangsnippel 1 1/2"x 1"
  ('5020438', '1 1/2"x 3/4"'), -- Overgangsnippel 1 1/2"x 3/4"
  ('5020435', '1 1/4"x 3/4"'), -- Overgangsnippel 1 1/4"x 3/4"
  ('5020446', '2 1/2"x 2"'), -- Overgangsnippel 2 1/2"x 2"
  ('5020442', '2"x 1"'), -- Overgangsnippel 2"x 1"
  ('5020444', '2"x1 1/2"'), -- Overgangsnippel 2"x1 1/2"
  ('5020443', '2"x1 1/4"'), -- Overgangsnippel 2"x1 1/4"
  ('5020429', '3/4"x 1/2"'), -- Overgangsnippel 3/4"x 1/2"
  ('5020488', '1 1/2" R'), -- Plugg messing 1 1/2" R
  ('5020487', '1 1/4" R'), -- Plugg messing 1 1/4" R
  ('5020486', '1" R'), -- Plugg messing 1" R
  ('5020485', '3/4" R'), -- Plugg messing 3/4" R
  ('5020507', '1 1/4" R'), -- T-rør messing 1 1/4" R
  ('5020509', '2" R'), -- T-rør messing 2" R
  ('5020109', '2" R'), -- Albue messing 2" R
  ('5020336', '1" R'), -- Nippelmuffe messing 1" R
  ('5020362', '1"x 3/4"'), -- Nippelmuffe messing 1"x 3/4"
  ('5020433', '1"x 3/4"'), -- Overgangsnippel 1"x 3/4"
  ('5020436', '1 1/4"x 1"'), -- Overgangsnippel 1 1/4"x 1"
  ('5020441', '1 1/2"x1 1/4"'), -- Overgangsnippel 1 1/2"x1 1/4"
  ('5020489', '2" R'), -- Plugg messing 2" R
  ('3326979', '110 mm'), -- Anboringsklammer 110 x 1" AVK
  ('3326993', '160 mm'), -- Anboringsklammer 160 x 1" AVK
  ('3327003', '160 mm'), -- Anboringsklammer 160 x 2" AVK
  ('3326956', '63 mm'), -- Anboringsklammer 63 x 1.1/2" AVK
  ('3326959', '75 mm'), -- Anboringsklammer 75 x 1" AVK
  ('3326969', '90 mm'), -- Anboringsklammer 90 x 1" AVK
  ('2041008', 'DN100'), -- Blindflens (X), DN100 PN10/16
  ('5577709', 'DN100'), -- Brannventil DN100 mm
  ('2041919', '100 mm'), -- Flense t-rør 100 duktilt
  ('2041929', '150 mm'), -- Flense t-rør 150 duktilt
  ('5600916', '1 1/2"'), -- Kuleventil 1 1/2" avstengingsfri, m/hendel
  ('5600912', '1"'), -- Kuleventil 1" avstengingsfri, m/hendel
  ('5635613', '150 mm'), -- Mellomring 150 - 1.1/2" S-1450
  ('5636684', 'DN200'), -- Mellomring, DN200
  ('2071606', 'DN100'), -- Muffesikring, DN100/Ø110
  ('5510839', '100/150 mm'), -- Nøkkeltopp høyre 100/150 AVK
  ('5502009', '100-150 mm'), -- Ratt 100-150 for sluseventil
  ('5513622', 'DN50'), -- Sluseventil DN50 epoxy PN16
  ('5510039', 'DN100'), -- Sluseventil, DN100, HL, PN16
  ('1901375', 'DN150/168,3'), -- Sveiseflens plan DN150/168,3
  ('2070136', '46x32 mm'), -- Tippunion ZAK 46x32 mm
  ('5508676', 'DN100'), -- Ventil-X, DN100, HL, PN16
  ('2189315', '1600x1000 mm'), -- Kjegle 1600x1000 mm Premod
  ('2181317', '1200x650x600 mm'), -- Kjegle IG-T 1200x650x600 mm
  ('2108392', '150 mm'), -- Kumgjennomføring 150 mm F-930
  ('2108506', '105-175 mm'), -- Kumgjennomføring 911 OD105-175
  ('2108406', '110 mm'), -- Kumgjennomføring F910 110
  ('2108413', '160 mm'), -- Kumgjennomføring F910 160
  ('2108416', '200 mm'), -- Kumgjennomføring F910 200
  ('2108423', '250 mm'), -- Kumgjennomføring F910 250
  ('2108428', '400 mm'), -- Kumgjennomføring F910 400
  ('2108509', '200-280 mm'), -- Kumgjennomføring F911 200-280
  ('3237163', '315 mm'), -- Kumlokk og ramme Ø315 D400
  ('3237651', '650 mm'), -- Kumlokk og ramme Ø650 flytende D400
  ('2181292', '1200x300 mm'), -- Kumring IG-T 1200x300 mm
  ('2181298', '1600x300 mm'), -- Kumring IG-T 1600x300 mm
  ('2181299', '1600x500 mm'), -- Kumring IG-T 1600x500 mm
  ('2181303', '2000x500 mm'), -- Kumring IG-T 2000x500 mm
  ('3300513', '650/640 mm'), -- Kuppelrist 650/640 lav
  ('3300732', '400 mm'), -- Rennestens ramme/rist, for Ø400
  ('3302402', '650 mm'), -- Ristlokk URL 650 (NSRL)
  ('3222705', '110x315 mm'), -- Spyle-/inspeksjonskum 110x315 rettløp
  ('3222723', '160x315 mm'), -- Spyle-/inspeksjonskum 160x315 høy/ven
  ('3222269', '315 mm'), -- Spylekum dobbel gren PE 315
  ('9821417', '650 mm'), -- Støttering, Ø650 mm
  ('3356834', '315x375 mm'), -- Teleskoprør 315x375 mm
  ('3220697', '160 mm'), -- Teleskoptopp 160 mm rundt lokk
  ('2182009', '1600 mm') -- Pakning GLI 1600 for betongkumring
) as d(sku, dimensjon)
where t.sku = d.sku
  and (t.dimension is null or btrim(t.dimension) = '');
