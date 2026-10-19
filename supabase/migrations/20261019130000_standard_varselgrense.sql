-- Standard varselgrense: «Snart tomt» for varer utan eiga grense.
--
-- Nesten ingen varer har varselgrense, så statusen «Snart tomt» kom aldri.
-- No gjeld ei standardgrense per eining – éi for stk og éi for meter – for
-- alle varer der grensa er 0. Ei vare med eiga grense brukar framleis si.
--
-- Standardgrensa styrer berre statusen og talet «Snart tomme». «Tomme» og
-- innkjøpsforslaga tel framleis berre varer med eiga grense: dei 156 varene
-- frå Dahl-lista som aldri er tekne inn, står på 0 og skal ikkje bli støy.
--
-- Ikkje i pipe_public_settings: kundeflyten treng dei ikkje.
--
-- Må tole å bli køyrd om att.

alter table public.pipe_settings
  add column if not exists low_stock_default_stk numeric not null default 2,
  add column if not exists low_stock_default_m numeric not null default 10;

alter table public.pipe_settings drop constraint if exists pipe_settings_low_stock_default_check;
alter table public.pipe_settings
  add constraint pipe_settings_low_stock_default_check
  check (low_stock_default_stk >= 0 and low_stock_default_m >= 0);

comment on column public.pipe_settings.low_stock_default_stk is
  'Varselgrense for stk-varer utan eiga grense. 0 = av.';
comment on column public.pipe_settings.low_stock_default_m is
  'Varselgrense for meter-varer utan eiga grense. 0 = av.';

-- Revisjonssporet skal ha med dei nye felta
drop trigger if exists trg_revisjon_pipe_settings on public.pipe_settings;
create trigger trg_revisjon_pipe_settings
  after update on public.pipe_settings
  for each row execute function public.pipe_revisjon_logg(
    'company_name,org_number,address,phone,email,show_prices,require_phone,require_signature,vat_rate,markup_percent,price_round_to,price_round_up,low_stock_default_stk,low_stock_default_m,accept_orders,order_email,payment_terms_days,stock_project_id', 'company_name');
