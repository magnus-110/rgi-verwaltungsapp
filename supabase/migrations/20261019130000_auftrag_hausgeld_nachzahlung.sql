-- Einzug „Hausgeld-Nachzahlung“ (rückwirkende Hausgeldänderung) als eigene Betragsquelle
alter table public.payment_orders drop constraint if exists payment_orders_betragsquelle_check;
alter table public.payment_orders add constraint payment_orders_betragsquelle_check
  check (betragsquelle in ('fest', 'abrechnung', 'wirtschaftsplan', 'nachzahlung'));
