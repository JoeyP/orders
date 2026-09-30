-- B&L Neeley Orders V3.3 — Verified shared-order permissions
-- Safe to run once after prior migrations.
-- This makes the intended team model explicit: authenticated app users can
-- read and work on the shared order tables; anonymous/public users cannot.

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='orders'
  loop
    execute format('drop policy if exists %I on public.orders',p.policyname);
  end loop;
end $$;

create policy "orders authenticated select"
on public.orders for select to authenticated using (true);

create policy "orders authenticated insert"
on public.orders for insert to authenticated
with check (auth.uid() = created_by);

create policy "orders authenticated update"
on public.orders for update to authenticated
using (true) with check (true);

create policy "orders authenticated delete"
on public.orders for delete to authenticated using (true);

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='order_items'
  loop
    execute format('drop policy if exists %I on public.order_items',p.policyname);
  end loop;
end $$;

create policy "order items authenticated select"
on public.order_items for select to authenticated using (true);

create policy "order items authenticated insert"
on public.order_items for insert to authenticated with check (true);

create policy "order items authenticated update"
on public.order_items for update to authenticated
using (true) with check (true);

create policy "order items authenticated delete"
on public.order_items for delete to authenticated using (true);
