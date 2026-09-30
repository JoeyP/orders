B&L Neeley Orders V3.2 — Delivery Workflow

IMPORTANT ORDER:
1. Run migration_v3_2_delivery.sql in Supabase SQL Editor.
2. Upload the website files in this ZIP to the ROOT of the GitHub orders repository.
3. KEEP your existing config.js exactly as-is. Do not replace or delete it.
4. Wait for GitHub Pages to deploy, then refresh the site.

NEW DELIVERY METHODS
- B&L Neeley Delivery
- LJE Shipping
- Other (optional free-text description)

VISIBLE ON
- New Order
- Mobile Orders
- Order Tracker
- Admin Orders
- All Edit Order popups
- Admin CSV export

NEW DELIVERIES PAGE
- Shows ONLY orders marked B&L Neeley Delivery.
- White = not Ready.
- Green = Ready.
- Gray = already Delivered/Shipped.
- Shows Requested Delivery Date; it intentionally does NOT show Scheduled Pickup Date.
- Driver can mark Delivered/Shipped directly from this page.
- Active view hides delivered/shipped orders.

PRESERVED FEATURES
- Flexible order parser:
  1 - 55g Product
  1 x 55 Product
  1 (55) Product
  1(55) Product
  1-55 Product
  1 55 Product
- New Order double-submit protection + unmistakable success popup.
- Mobile/Admin/Tracker editing.
- Delete Order only inside the Edit popup.
- Admin CSV export + date range/search/status filters.
- Blending forecast.
- 60-second auto refresh.
