-- Prosjektnummer fra SmartDok.
--
-- Adminbordet holder én prosjektliste for alle appene og synker den hit, med
-- SmartDok-nummeret som project_number (2026117 og så videre). Telleren startet
-- på 1, og prosjekter som opprettes her hentes inn i den felles lista med
-- nummeret sitt. Da ville rørlagerets prosjekt 1, 2, 3 blitt prosjekter med
-- nummer 1, 2, 3 i tilbud, lager og utleie.
--
-- Fra 9000001 kolliderer telleren ikke med SmartDok, som nummererer år + løpenummer,
-- og et prosjekt som er opprettet her er lett å kjenne igjen på nummeret.
--
-- Rører ikke prosjekter som alt finnes: setval flytter bare neste verdi.

select setval(
  'public.projects_project_number_seq',
  greatest(9000000, (select coalesce(max(project_number), 0) from public.projects where project_number >= 9000000)),
  true
);
