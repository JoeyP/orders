B&L Neeley Orders V3.4 — Line-item Blending Selection

NEW WORKFLOW
- Every order item defaults to NOT selected for Blending.
- Admin Orders shows a Blend checkbox on every individual line item.
- Checking Blend immediately saves that item to Supabase.
- Blending page shows ONLY selected line items from orders that are not Shipped.
- Multiple selected orders for the same product are aggregated for total gallons.
- Product cards also show customer, PO, order number, requested delivery date,
  quantity/container, and lot number for each selected demand line.
- Shipped orders automatically disappear from active Blending without erasing
  the historical Blend flag.
- Editing an order preserves BOTH lot numbers and Blend flags. If item text is
  changed/reordered, exact text match is used first, then position fallback.

SQL REQUIRED
Run migration_v3_4_blending.sql ONCE before uploading the website files.

UPLOAD
For safest deployment, upload:
- app.js
- styles.css
- desktop.html
- blending.html

Other HTML pages in this ZIP are unchanged except cache version references.
Keep config.js unchanged.

After deployment confirm desktop.html and blending.html load app.js?v=3.4.0.
