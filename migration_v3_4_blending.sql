-- B&L Neeley Orders V3.4 — Line-item Blending Selection
-- Run ONCE in Supabase SQL Editor.
-- Existing and new line items default to NOT selected for blending.

alter table public.order_items
  add column if not exists requires_blending boolean not null default false;

create index if not exists idx_order_items_requires_blending
on public.order_items (requires_blending, order_id);

-- Existing rows are false automatically because of the NOT NULL default.
update public.order_items
set requires_blending = false
where requires_blending is null;
