-- B&L Neeley Orders V3.2 — Delivery Workflow
-- Run this ONCE in Supabase SQL Editor before uploading the V3.2 website files.
-- Existing orders are preserved. Existing orders will show "DELIVERY METHOD NOT SET"
-- until someone edits them and selects a method.

alter table public.orders
  add column if not exists delivery_method text,
  add column if not exists delivery_method_other text;

-- Allow existing historical orders to remain NULL, but constrain any selected value.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_delivery_method_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_method_check
      check (
        delivery_method is null
        or delivery_method in ('bl_neeley','lje','other')
      );
  end if;
end $$;

create index if not exists idx_orders_delivery_method
on public.orders (delivery_method, shipped, ready_to_ship, requested_delivery_date);
