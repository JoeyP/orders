B&L Neeley Orders V3.4.8 — CONSOLIDATED CURRENT BUILD

This package consolidates all changes through today's work into one deployment.

INCLUDED
- Order Tracker hides Ready orders.
- Tracker has no Scheduled or Pickup Date columns/filter.
- Back Ordered = charcoal/black.
- Past due OR due today + Not Ready = red.
- Due tomorrow + Not Ready = orange.
- Mobile keeps Ready green and Shipped gray.
- Admin has delivery urgency colors.
- Admin Blend checkboxes align with their exact product lines.
- Blend remains a per-item flag.
- Blending page shows only selected line items from unshipped orders.
- Blending page has Complete per line item.
- Complete sets requires_blending=false, removes the item from Blending,
  and unchecks that same item on Admin Orders.
- New Order success popup has View Order, Add Another Order, and Home.
- Flexible gallon parser and Delivery workflow remain included.

DEPLOYMENT
Replace ALL website files in the GitHub repo root with the files from this ZIP,
EXCEPT config.js. Keep your existing config.js exactly as-is.

SQL
If migration_v3_4_blending.sql has NOT been run yet, run it ONCE in Supabase.
If you already ran the V3.4 blending migration, do not run it again.
No newer SQL migration is required.

All HTML pages in this build reference app.js?v=3.4.8 and styles.css?v=3.4.8.
