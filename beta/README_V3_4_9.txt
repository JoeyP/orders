B&L Neeley Orders V3.4.9 — Consolidated UI Cleanup

Includes everything through V3.4.8 plus:
- Admin Blend checkbox alignment adjusted to product rows.
- New Order success popup is a clean 2x2 grid:
  View Order | Add Another Order
  Home       | View All Orders
- Home returns to index.html.
- View All Orders opens mobile.html.
- Ready orders are green on Admin, matching Mobile/Deliveries.
- Existing status priority retained:
  Back Ordered charcoal; past due/today not ready red; tomorrow not ready orange; then Ready green.
- All prior V3.4.8 functionality remains.

No SQL changes required.
Replace all website files from this package EXCEPT config.js.
Keep your existing config.js.
