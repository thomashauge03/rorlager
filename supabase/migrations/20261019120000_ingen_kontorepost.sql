-- Bestilling for henting: ingen e-post til kontoret (19.10.2026).
--
-- Kvar ny bestilling kjem til Innboks (innboks/kilder/rorlager.sql) som ei
-- hentebestilling som krev handling, og kontoret får ho der, med varsel på
-- telefon og PC og i morgonoppsummeringa. Den eigne e-posten herifrå
-- («kontor») blir difor ikkje kravd lenger. Kunden får kvitteringa, «klar» og
-- «avvist» som før.
--
-- Funksjonen er elles som i 20260924100200_bestilling_epost.sql, og
-- forklaringane på låsane og taka står der. pipe_settings.order_email står att
-- i basen, men blir ikkje lesen lenger.

create or replace function public.pipe_email_claim(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_settings public.pipe_settings;
  v_customer text;
  v_due text[] := array[]::text[];
  v_type text;
  v_emails jsonb := '[]'::jsonb;
begin
  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if not found or v_order.kind <> 'bestilling' then
    return jsonb_build_object('emails', '[]'::jsonb);
  end if;

  select * into v_settings from public.pipe_settings where id = 1;
  v_customer := lower(v_order.customer_email);

  -- Berre ferske e-postar.
  if v_order.created_at > now() - interval '24 hours' then
    v_due := v_due || 'kvittering'::text;
  end if;
  if v_order.status = 'behandlet' and v_order.stock_drawn_at > now() - interval '24 hours' then
    v_due := v_due || 'klar'::text;
  end if;
  if v_order.status = 'avvist' and v_order.handled_at > now() - interval '24 hours' then
    v_due := v_due || 'avvist'::text;
  end if;

  -- Låsen mot kappløp mellom ulike bestillingar.
  perform pg_advisory_xact_lock(hashtext('pipe_email_claim'));

  foreach v_type in array v_due loop
    -- Ein lås ingen kjem til å sleppe.
    delete from public.pipe_order_emails
     where order_id = p_order_id and type = v_type
       and sent_at is null and claimed_at < now() - interval '15 minutes';

    continue when exists (
      select 1 from public.pipe_order_emails where order_id = p_order_id and type = v_type
    );

    -- Døgntaket: under gratisgrensa hos Resend på 100.
    exit when (
      select count(*) from public.pipe_order_emails where claimed_at > now() - interval '24 hours'
    ) >= 90;

    -- Taket per mottakar. Kontorvarsel frå før denne fila tel ikkje.
    continue when (
      select count(*) from public.pipe_order_emails
       where recipient = v_customer and type <> 'kontor' and claimed_at > now() - interval '24 hours'
    ) >= 10;

    insert into public.pipe_order_emails (order_id, type, recipient)
    values (p_order_id, v_type, v_customer)
    on conflict (order_id, type) do nothing;

    if found then
      v_emails := v_emails || jsonb_build_object('type', v_type, 'to', v_customer);
    end if;
  end loop;

  if jsonb_array_length(v_emails) = 0 then
    return jsonb_build_object('emails', v_emails);
  end if;

  return jsonb_build_object(
    'emails', v_emails,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_number', v_order.order_number,
      'created_at', v_order.created_at,
      'status', v_order.status,
      'pickup_date', v_order.pickup_date,
      'pickup_now', v_order.pickup_now,
      'customer_type', v_order.customer_type,
      'customer_name', v_order.customer_name,
      'customer_email', v_order.customer_email,
      'customer_phone', v_order.customer_phone,
      'company', v_order.company,
      'org_number', v_order.org_number,
      'billing_address', v_order.billing_address,
      'comment', v_order.comment,
      'customer_message', v_order.customer_message,
      'total', v_order.total
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', l.name, 'dimension', l.dimension, 'sku', l.sku, 'unit', l.unit,
        'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total,
        'stock', t.stock
      ) order by l.sort_order)
      from public.pipe_order_lines l
      left join public.pipe_types t on t.id = l.pipe_type_id
      where l.order_id = p_order_id
    ), '[]'::jsonb),
    'company', jsonb_build_object(
      'name', v_settings.company_name,
      'org_number', v_settings.org_number,
      'address', v_settings.address,
      'phone', v_settings.phone,
      'email', v_settings.email,
      'pickup_note', v_settings.pickup_note,
      'vat_rate', v_settings.vat_rate,
      'payment_terms_days', v_settings.payment_terms_days
    )
  );
end;
$$;

revoke all on function public.pipe_email_claim(uuid) from public, anon, authenticated;
grant execute on function public.pipe_email_claim(uuid) to service_role;
