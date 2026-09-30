B&L Neeley Orders V3.3.6 — Unified Deliveries Renderer

This removes the dual desktop-table/mobile-card system entirely.

ROOT ISSUE ADDRESSED
V3.3.4 maintained two separate delivery render targets and hid one or the other
with CSS. The database query was succeeding (the order count updated), but the
visible delivery target was not showing the generated records consistently.

V3.3.6 renders every delivery into ONE #deliveryList container on every device.
Desktop and mobile only differ in responsive styling; there is no second hidden
copy of the order list.

No SQL migration required.

UPLOAD THESE 3 FILES
- deliveries.html
- app.js
- styles.css

Keep config.js unchanged.
Confirm deliveries.html references app.js?v=3.3.6 and styles.css?v=3.3.6.
