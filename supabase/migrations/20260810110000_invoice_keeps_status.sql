-- Fakturagrunnlaget skal ikkje flytte statusen på bestillingane.
--
-- Den første utgåva sette status = 'behandlet' på alle uttak med status 'ny' når
-- eit grunnlag blei laga. Det var feil av to grunnar: å fakturere og å ekspedere
-- er to ulike ting, og angre-knappen kunne ikkje setje statusen tilbake – han
-- veit ikkje kva han var før. Resultatet var ei stille endring som ikkje lét seg
-- reversere.
--
-- No rører grunnlaget berre invoice_id, som er nettopp det angre-knappen kan
-- nullstille. Status blir styrt der han høyrer heime: i bestillingslista.

create or replace function public.pipe_create_invoice(
  p_customer_name text,
  p_period_from date,
  p_period_to date,
  p_order_ids uuid[],
  p_total numeric,
  p_note text default null
)
returns public.pipe_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.pipe_invoices;
  v_already int;
begin
  if auth.uid() is null then
    raise exception 'Krever innlogging';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    raise exception 'Ingen bestillinger valgt';
  end if;
  if p_period_from is null or p_period_to is null then
    raise exception 'Både fra- og til-dato må fylles ut';
  end if;

  -- Ei bestilling skal aldri hamne på to grunnlag. Sjekken ligg her og ikkje
  -- berre i grensesnittet, i tilfelle to faner blir brukte samtidig.
  select count(*) into v_already
  from public.pipe_orders
  where id = any(p_order_ids) and invoice_id is not null;

  if v_already > 0 then
    raise exception '% av bestillingene er allerede fakturert', v_already;
  end if;

  insert into public.pipe_invoices (customer_name, period_from, period_to, total, note)
  values (p_customer_name, p_period_from, p_period_to, coalesce(p_total, 0), p_note)
  returning * into v_invoice;

  update public.pipe_orders
  set invoice_id = v_invoice.id
  where id = any(p_order_ids);

  return v_invoice;
end;
$$;

revoke all on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) from public, anon;
grant execute on function public.pipe_create_invoice(text, date, date, uuid[], numeric, text) to authenticated;
