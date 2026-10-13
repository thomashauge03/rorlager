-- Persondata blir ikkje liggjande for alltid.
--
-- Personvernerklæringa lova at det som ikkje blir fakturert, blir sletta «når
-- det ikkje lenger har noko formål». Ingen kode gjorde det. Avviste
-- bestillingar, gamle uttak og signaturar låg att på ubestemt tid – og namnet
-- til kunden overlevde i forslaga etter at ordren var sletta.
--
-- Fristane står samla i pipe_rydd_persondata(), og erklæringa på /personvern
-- seier det same. Endrar du ein frist her, endrar du teksten der.
--
--   Avvist bestilling           slettast etter 90 dagar (aldri trekt lager)
--   Ufakturert ordre            anonymiserast etter 2 år
--   Fakturert ordre             anonymiserast etter 6 år (bokføringslova:
--                               5 år etter utgangen av rekneskapsåret)
--   Forslag                     namnet fjerna når ordren er sletta, og etter 1 år
--
-- Anonymisert tyder: namn, telefon, e-post, signatur, kommentar og adresse er
-- borte. Kva som blei teke ut, når og til kva pris står – det er lagertal og
-- rekneskap, ikkje personopplysningar.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

-- ── Forslaget mister namnet når ordren blir sletta ──
--
-- Forslaget overlever ordren med vilje: det er tilbakemeldinga som er verdien.
-- Namnet på den som sende det, er ikkje det.

create or replace function public.pipe_orders_glem_forslag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pipe_suggestions set submitted_by = null where order_id = old.id;
  return old;
end;
$$;

revoke all on function public.pipe_orders_glem_forslag() from public, anon, authenticated;

drop trigger if exists trg_pipe_orders_glem_forslag on public.pipe_orders;
create trigger trg_pipe_orders_glem_forslag
  before delete on public.pipe_orders
  for each row execute function public.pipe_orders_glem_forslag();


-- ── Ryddinga ──

create or replace function public.pipe_rydd_persondata()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avvist int;
  v_anonym int;
  v_forslag int;
  v_epostlogg int;
begin
  -- 1. Avviste bestillingar etter 90 dagar. Dei har aldri trekt lageret
  --    (pipe_orders_bestilling_lager), så ingenting i lagerloggen peikar på dei.
  delete from public.pipe_orders
   where kind = 'bestilling' and status = 'avvist' and invoice_id is null
     and coalesce(handled_at, created_at) < now() - interval '90 days';
  get diagnostics v_avvist = row_count;

  -- 2 og 3. Anonymiser: ufakturerte etter 2 år, fakturerte etter 6.
  --    E-posten på ei bestilling kan ikkje vere tom (pipe_orders_bestilling_felt).
  update public.pipe_orders o
     set customer_name = 'Anonymisert',
         customer_phone = null,
         customer_email = case when o.kind = 'bestilling' then 'anonymisert' else null end,
         company = null,
         org_number = null,
         billing_address = null,
         signature = null,
         comment = null,
         customer_message = null
   where o.customer_name <> 'Anonymisert'
     and (
       (o.invoice_id is null and o.created_at < now() - interval '2 years')
       or (o.invoice_id is not null and o.created_at < now() - interval '6 years')
     );
  get diagnostics v_anonym = row_count;

  -- Fakturagrunnlag etter 6 år: kundenamnet kan vere ein privatperson.
  update public.pipe_invoices
     set customer_name = 'Anonymisert', note = null
   where customer_name <> 'Anonymisert' and created_at < now() - interval '6 years';

  -- E-postloggen har mottakaradressa. Han trengst berre medan e-postane blir sende.
  delete from public.pipe_order_emails
   where claimed_at < now() - interval '1 year';
  get diagnostics v_epostlogg = row_count;

  -- 4. Forslag: namnet er borte etter eitt år, behandla eller ikkje.
  update public.pipe_suggestions
     set submitted_by = null
   where submitted_by is not null and created_at < now() - interval '1 year';
  get diagnostics v_forslag = row_count;

  return jsonb_build_object(
    'avviste_bestillinger_slettet', v_avvist,
    'ordrer_anonymisert', v_anonym,
    'epostlogg_slettet', v_epostlogg,
    'forslag_uten_navn', v_forslag
  );
end;
$$;

-- Berre for jobben i basen. Ingen i appen skal kunne setje ho i gang.
revoke all on function public.pipe_rydd_persondata() from public, anon, authenticated;


-- ── Kvar natt kl. 03.15 ──
--
-- pg_cron finst i Supabase, men ikkje i testbasen (PGlite). Utan han står
-- funksjonen klar, og ein kan køyre ho for hand.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rorlager-rydd-persondata', '15 3 * * *', 'select public.pipe_rydd_persondata()');
  else
    raise notice 'pg_cron er ikke installert – pipe_rydd_persondata() kjøres ikke automatisk.';
  end if;
exception
  when insufficient_privilege or undefined_function or invalid_schema_name then
    raise warning 'Fikk ikke satt opp nattlig rydding (%). Slå på pg_cron under Database → Extensions og kjør setup på nytt.', sqlerrm;
end $$;
