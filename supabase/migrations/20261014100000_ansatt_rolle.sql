-- Rolla «ansatt», og prosjektet frå ei liste i kassen.
--
-- Ein vanleg tilsett gjer det same som ein kunde: tek rør ut av lageret. Han
-- slepp skjemaet, fordi uttaket blir registrert på brukaren, og vel berre kva
-- prosjekt det skal på. Han ser ikkje adminpanelet.
--
-- Rolla treng ingen endring i tilgangsvakta. hm_er_kontor() er ei kvitliste
-- (admin, kontor, lager), så 'ansatt' gir ingen tilgang til kontoret sine
-- tabellar – akkurat det kommentaren der lova: «en rolle ingen har tenkt på skal
-- ikke gi tilgang til fakturagrunnlag og innkjøpspriser».
--
-- Det nye er lista over prosjekt og at uttaket kan peike på eitt av dei.
--
-- Må tole å bli køyrd om att: supabase-setup.sql blir limt inn på nytt kvar
-- gong det kjem ei ny migrasjon.

-- ── 1. Kva prosjekt uttaket gjekk til ──

alter table public.pipe_orders add column if not exists project_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pipe_orders_project_id_fkey') then
    alter table public.pipe_orders
      add constraint pipe_orders_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end $$;

create index if not exists idx_pipe_orders_project on public.pipe_orders (project_id);

comment on column public.pipe_orders.project_id is
  'Prosjektet ein tilsett valde i kassen. Null for kundar, og for «Annet – skriv selv». Teksten i project blir skriven av basen frå prosjektet, ikkje av klienten.';


-- ── 2. Lista i kassen ──

/*
 * Nummer og namn på dei aktive prosjekta, for alle som står i brukarregisteret.
 *
 * SECURITY DEFINER fordi projects berre kan lesast av kontoret og av dei som er
 * med på prosjektet. Ein tilsett skal kunne føre eit uttak på kva jobb som helst,
 * men treng ikkje sjå meir enn det han vel mellom: ikkje adresse, kunde eller
 * notat.
 *
 * hm_rolle() er null for ein som har registrert seg sjølv utan at nokon har
 * sleppt han inn – han får ei tom liste.
 */
create or replace function public.pipe_prosjektliste()
returns table (id uuid, project_number bigint, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.project_number, p.name
    from public.projects p
   where p.status = 'aktiv'
     and public.hm_rolle() is not null
   order by p.project_number desc
$$;

revoke all on function public.pipe_prosjektliste() from public, anon;
grant execute on function public.pipe_prosjektliste() to authenticated;

/** Slik eit prosjekt står på uttaket og i fakturagrunnlaget: «9000123 · Storgata 4». */
create or replace function public.pipe_prosjekttekst(p_project_number bigint, p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select p_project_number::text || ' · ' || btrim(p_name)
$$;


-- ── 3. Uttaket ──
--
-- Same reglar som 20261013110000_annet_forslag.sql, med éin parameter til:
-- p_project_id. Den gamle signaturen blir fjerna, elles ville PostgREST hatt to
-- funksjonar å velje mellom. Den nye parameteren har standardverdi, så ein
-- eldre klient som ikkje sender han, treffer framleis.

drop function if exists public.pipe_submit_order(text, jsonb, text, text, text, text, text, text);

create or replace function public.pipe_submit_order(
  p_customer_name text,
  p_lines jsonb,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_company text default null,
  p_project text default null,
  p_comment text default null,
  p_signature text default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pipe_orders;
  v_line jsonb;
  v_type public.pipe_types;
  v_qty numeric;
  v_total numeric := 0;
  v_i integer := 0;
  v_name text;
  v_email text;
  v_innlogga boolean := auth.uid() is not null;
  v_lines_out jsonb := '[]'::jsonb;
  v_balance numeric;
  v_project_id uuid;
  v_project text := nullif(btrim(coalesce(p_project, '')), '');
  v_prosjekt public.projects;
begin
  if v_innlogga then
    -- Ein tilsett: registrert på brukaren, uansett kva skjemaet sende.
    v_name := public.hm_mitt_namn();
    v_email := nullif(auth.jwt() ->> 'email', '');
  else
    v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
    v_email := nullif(btrim(coalesce(p_customer_email, '')), '');
  end if;

  if v_name is null then
    raise exception 'Navn må fylles ut';
  end if;

  if v_innlogga then
    /*
     * Prosjektet frå lista: teksten blir skriven her, frå prosjektet, ikkje
     * teken frå klienten. Då kan ingen føre eit uttak på «9000123 · Storgata 4»
     * med eit anna namn enn prosjektet har, og fakturagrunnlaget, som samlar på
     * teksten, får same tekst kvar gong.
     */
    if p_project_id is not null then
      select * into v_prosjekt from public.projects where id = p_project_id;
      if not found or v_prosjekt.status <> 'aktiv' then
        raise exception 'Prosjektet finnes ikke eller er avsluttet. Velg et annet.';
      end if;
      v_project_id := v_prosjekt.id;
      v_project := public.pipe_prosjekttekst(v_prosjekt.project_number, v_prosjekt.name);
    elsif v_project is null then
      raise exception 'Velg hvilket prosjekt varene skal på';
    end if;
  elsif v_email is null then
    raise exception 'E-post må fylles ut. Har du ikke e-post, skriv «ingen».';
  end if;
  -- Ein kunde vel ikkje frå lista. Sender ein klient likevel ein id utan
  -- innlogging, blir han ikkje brukt: det ville gitt ut prosjektnamnet på
  -- kvitteringa til kven som helst som gjetta ein uuid.

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Handlekurven er tom';
  end if;

  -- Tak på tal linjer: skjemaet kan ikkje lage så mange, så dette er ei sperre
  -- mot at nokon sender inn tusenvis av linjer rett mot funksjonen.
  if jsonb_array_length(p_lines) > 100 then
    raise exception 'For mange varelinjer';
  end if;
  if public.pipe_tal_annet(p_lines) > 10 then
    raise exception 'Høyst 10 «annet»-linjer per uttak';
  end if;

  insert into public.pipe_orders (
    customer_name, customer_phone, customer_email, company, project, project_id, comment, signature, created_by
  ) values (
    v_name,
    nullif(btrim(coalesce(p_customer_phone, '')), ''),
    v_email,
    nullif(btrim(coalesce(p_company, '')), ''),
    v_project,
    v_project_id,
    nullif(btrim(coalesce(p_comment, '')), ''),
    nullif(p_signature, ''),
    auth.uid()
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_i := v_i + 1;

    if v_line ? 'annet' then
      v_lines_out := v_lines_out || public.pipe_annet_linje(v_order.id, v_line, v_i, v_name);
      continue;
    end if;

    v_qty := round((v_line ->> 'quantity')::numeric, 2);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Ugyldig mengde på en av linjene';
    end if;
    if v_qty > 100000 then
      raise exception 'Mengden er urimelig stor';
    end if;

    select * into v_type from public.pipe_types where id = (v_line ->> 'pipe_type_id')::uuid;
    if not found then
      raise exception 'Ukjent rørtype i handlekurven';
    end if;
    if not v_type.active then
      raise exception 'Varen % er ikke tilgjengelig', v_type.name;
    end if;

    insert into public.pipe_order_lines (
      order_id, pipe_type_id, name, dimension, sku, unit, quantity, unit_price, line_total, sort_order
    ) values (
      v_order.id, v_type.id, v_type.name, v_type.dimension, v_type.sku, v_type.unit,
      v_qty, v_type.price,
      case when v_type.price is null then null else round(v_type.price * v_qty, 2) end,
      v_i
    );

    if v_type.price is not null then
      v_total := v_total + round(v_type.price * v_qty, 2);
    end if;

    -- Uttaket blir trekt frå med ein gong. Beholdninga får gå i minus:
    -- det er reell informasjon om at nokon har teke meir enn lageret viste.
    update public.pipe_types
      set stock = stock - v_qty
      where id = v_type.id
      returning stock into v_balance;

    insert into public.pipe_stock_log (pipe_type_id, pipe_name, change, balance_after, reason, order_id, note)
    values (v_type.id, v_type.name, -v_qty, v_balance, 'bestilling', v_order.id,
            'Bestilling #' || v_order.order_number);

    v_lines_out := v_lines_out || jsonb_build_object(
      'name', v_type.name,
      'dimension', v_type.dimension,
      'sku', v_type.sku,
      'unit', v_type.unit,
      'quantity', v_qty,
      'unit_price', v_type.price,
      'line_total', case when v_type.price is null then null else round(v_type.price * v_qty, 2) end,
      'annet', false
    );
  end loop;

  update public.pipe_orders set total = v_total where id = v_order.id returning * into v_order;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'customer_name', v_order.customer_name,
    'company', v_order.company,
    'project', v_order.project,
    'comment', v_order.comment,
    'total', v_order.total,
    'lines', v_lines_out
  );
end;
$$;

revoke all on function public.pipe_submit_order(text, jsonb, text, text, text, text, text, text, uuid) from public;
grant execute on function public.pipe_submit_order(text, jsonb, text, text, text, text, text, text, uuid) to anon, authenticated;
