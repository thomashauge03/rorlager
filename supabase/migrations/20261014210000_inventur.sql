-- Inventur: tel heile lageret, sjå avvika, lagre alt på ein gong.
--
-- «Tell opp» fanst berre for éi vare om gongen. Ei inventur er mange teljingar
-- som høyrer saman: anten står alle, eller ingen – ein halvlagra inventur der
-- nett forsvann på hylle C, er verre enn ingen.
--
-- Beholdninga blir sett til det som er telt, og differansen blir logga som
-- «opptelling», same grunn som «Tell opp». Varer som ikkje er telde, blir ikkje
-- rørte.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

create or replace function public.pipe_inventur(p_linjer jsonb, p_merknad text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linje jsonb;
  v_type public.pipe_types;
  v_telt numeric;
  v_diff numeric;
  v_telde int := 0;
  v_avvik int := 0;
  v_note text := 'Inventur ' || to_char(now() at time zone 'Europe/Oslo', 'DD.MM.YYYY')
                 || coalesce(' – ' || nullif(btrim(coalesce(p_merknad, '')), ''), '');
begin
  if not public.hm_er_kontor() then
    raise exception 'Ingen tilgang til admindelen' using errcode = '42501';
  end if;
  if p_linjer is null or jsonb_typeof(p_linjer) <> 'array' or jsonb_array_length(p_linjer) = 0 then
    raise exception 'Ingenting er telt';
  end if;
  if jsonb_array_length(p_linjer) > 5000 then
    raise exception 'For mange linjer i én inventur';
  end if;
  if length(coalesce(p_merknad, '')) > 300 then
    raise exception 'Merknaden er for lang (høyst 300 tegn)';
  end if;

  for v_linje in select * from jsonb_array_elements(p_linjer)
  loop
    if coalesce(v_linje ->> 'telt', '') !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'Ugyldig antall på en av varene';
    end if;
    v_telt := round((v_linje ->> 'telt')::numeric, 2);
    if v_telt < 0 then
      raise exception 'Et telt antall kan ikke være under null';
    end if;
    if v_telt > 1000000 then
      raise exception 'Antallet er urimelig stort';
    end if;

    -- Låsen: eit uttak midt i inventuren ventar, så differansen blir rekna mot
    -- det som faktisk står i basen når teljinga blir lagra.
    select * into v_type from public.pipe_types where id = (v_linje ->> 'pipe_type_id')::uuid for update;
    if not found then
      raise exception 'En av varene finnes ikke lenger. Last siden på nytt.';
    end if;

    v_telde := v_telde + 1;
    v_diff := v_telt - v_type.stock;
    if v_diff <> 0 then
      v_avvik := v_avvik + 1;
      update public.pipe_types set stock = v_telt where id = v_type.id;
      insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, note)
      values (v_type.id, v_type.name, v_diff, v_telt, 'opptelling', v_note);
    end if;
  end loop;

  return jsonb_build_object('telde', v_telde, 'avvik', v_avvik);
end;
$$;

revoke all on function public.pipe_inventur(jsonb, text) from public, anon;
grant execute on function public.pipe_inventur(jsonb, text) to authenticated;
