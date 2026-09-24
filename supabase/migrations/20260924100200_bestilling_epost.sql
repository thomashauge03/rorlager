-- Bestilling for henting: e-postlåsen.
--
-- Funksjonen bestilling-epost kan kallast av kven som helst – kunden er ikkje
-- innlogga. Difor tek han aldri imot ei e-postadresse eller ein e-posttype. Han
-- får id-en til ei bestilling og spør denne funksjonen kva som skal sendast.
-- Svaret kjem frå statusen og frå det som alt er sendt, og kvar e-post kan gå
-- éin gong per bestilling. Då er kvart kall trygt å gjenta.
--
-- Berre service_role kan kalle desse. Tenestenøkkelen ligg i Supabase og
-- forlèt aldri tenaren.

create or replace function public.pipe_email_claim(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_settings public.pipe_settings;
  v_office text;
  v_customer text;
  v_due text[] := array[]::text[];
  v_type text;
  v_to text;
  v_emails jsonb := '[]'::jsonb;
begin
  -- Låsen: to kall om same bestilling ventar på kvarandre her, og den andre ser
  -- rada den første sette inn.
  select * into v_order from public.pipe_orders where id = p_order_id for update;
  if not found or v_order.kind <> 'bestilling' then
    return jsonb_build_object('emails', '[]'::jsonb);
  end if;

  select * into v_settings from public.pipe_settings where id = 1;
  v_office := lower(coalesce(nullif(btrim(v_settings.order_email), ''), nullif(btrim(v_settings.email), '')));
  v_customer := lower(v_order.customer_email);

  /*
   * BERRE FERSKE E-POSTAR.
   *
   * Blir e-post slått på ein månad etter at bestillingane kom i gang, skal
   * ingen få ei kvittering på noko dei bestilte for fire veker sidan.
   */
  if v_order.created_at > now() - interval '24 hours' then
    v_due := v_due || 'kvittering'::text;
    if v_office is not null then
      v_due := v_due || 'kontor'::text;
    end if;
  end if;
  -- «behandlet», ikkje «levert»: er bestillinga henta før e-posten gjekk, skal
  -- kunden ikkje få beskjed om at ho er klar.
  if v_order.status = 'behandlet' and v_order.stock_drawn_at > now() - interval '24 hours' then
    v_due := v_due || 'klar'::text;
  end if;
  if v_order.status = 'avvist' and v_order.handled_at > now() - interval '24 hours' then
    v_due := v_due || 'avvist'::text;
  end if;

  /*
   * LÅSEN MOT KAPPLØP MELLOM ULIKE BESTILLINGAR.
   *
   * Begge taka i løkka under er ei teljing følgt av ein insert, utan noko som
   * bind dei saman. Rad-låsen øvst («for update») gjeld berre DENNE eine
   * bestillinga – to samtidige kall for to ULIKE bestillingar kan begge telje
   * under grensa før nokon av dei har sett inn rada si, og begge sleppe
   * gjennom. Denne låsen gjer kalla serielle på tvers av bestillingar òg, og
   * transaksjonsomfanget (xact) sleppar han automatisk når funksjonen er
   * ferdig, anten ho lykkast eller feilar.
   */
  perform pg_advisory_xact_lock(hashtext('pipe_email_claim'));

  foreach v_type in array v_due loop
    /*
     * EIN LÅS INGEN KJEM TIL Å SLEPPE.
     *
     * Ei rad utan sent_at som er eldre enn eit kvarter, høyrer til eit kall som
     * aldri kom i mål: funksjonen døydde mellom kravet og sendinga, eller svaret
     * på kravet kom aldri fram. Ingen kjem til å merkje eller sleppe henne, så ho
     * blir fjerna her, og e-posten kan krevjast på nytt. Eit kvarter er langt
     * over kor lenge ein kantfunksjon får leve.
     */
    delete from public.pipe_order_emails
     where order_id = p_order_id and type = v_type
       and sent_at is null and claimed_at < now() - interval '15 minutes';

    continue when exists (
      select 1 from public.pipe_order_emails where order_id = p_order_id and type = v_type
    );

    v_to := case when v_type = 'kontor' then v_office else v_customer end;

    -- Døgntaket: under gratisgrensa hos Resend på 100.
    exit when (
      select count(*) from public.pipe_order_emails where claimed_at > now() - interval '24 hours'
    ) >= 90;

    -- Taket per mottakar. Kontorets adresse tel ikkje: ein travel dag skal ikkje
    -- stengje kontoret ute frå sine eigne varsel.
    continue when v_type <> 'kontor' and (
      select count(*) from public.pipe_order_emails
       where recipient = v_to and type <> 'kontor' and claimed_at > now() - interval '24 hours'
    ) >= 10;

    insert into public.pipe_order_emails (order_id, type, recipient)
    values (p_order_id, v_type, v_to)
    on conflict (order_id, type) do nothing;

    if found then
      v_emails := v_emails || jsonb_build_object('type', v_type, 'to', v_to);
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

create or replace function public.pipe_email_mark_sent(p_order_id uuid, p_type text, p_provider_id text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pipe_order_emails
     set sent_at = now(), provider_id = p_provider_id
   where order_id = p_order_id and type = p_type;
$$;

-- Angre-steget. Utan det ville eit nettbrot hos Resend låst e-posten ute for
-- godt: rada stod, e-posten kom aldri, og ingen kunne be om henne att. Ei
-- sendt rad blir aldri fjerna.
create or replace function public.pipe_email_release(p_order_id uuid, p_type text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.pipe_order_emails
   where order_id = p_order_id and type = p_type and sent_at is null;
$$;

revoke all on function public.pipe_email_claim(uuid) from public, anon, authenticated;
revoke all on function public.pipe_email_mark_sent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pipe_email_release(uuid, text) from public, anon, authenticated;
grant execute on function public.pipe_email_claim(uuid) to service_role;
grant execute on function public.pipe_email_mark_sent(uuid, text, text) to service_role;
grant execute on function public.pipe_email_release(uuid, text) to service_role;
