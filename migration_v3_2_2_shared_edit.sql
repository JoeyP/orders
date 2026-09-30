-- B&L Neeley Orders V3.2.2 — Shared Team Editing
-- Run ONCE in Supabase SQL Editor.
--
-- Purpose:
-- All authenticated B&L users need to work on the same orders regardless of
-- which authenticated user originally entered the order.
--
-- This keeps anonymous/public access blocked. It only broadens UPDATE/DELETE
-- access to authenticated users inside the app.

-- ORDERS: replace UPDATE and DELETE policies with shared authenticated access.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='orders'
      and cmd in ('UPDATE','DELETE')
  loop
    execute format('drop policy if exists %I on public.orders', p.policyname);
  end loop;
end $$;

create policy "authenticated users can update orders"
on public.orders
for update
to authenticated
using (true)
with check (true);

create policy "authenticated users can delete orders"
on public.orders
for delete
to authenticated
using (true);

-- ORDER_ITEMS: same shared-team behavior for lots/item edits.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname='public'
      and tablename='order_items'
      and cmd in ('UPDATE','DELETE')
  loop
    execute format('drop policy if exists %I on public.order_items', p.policyname);
  end loop;
end $$;

create policy "authenticated users can update order items"
on public.order_items
for update
to authenticated
using (true)
with check (true);

create policy "authenticated users can delete order items"
on public.order_items
for delete
to authenticated
using (true);
