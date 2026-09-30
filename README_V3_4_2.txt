B&L Neeley Orders V3.4.2 — Warehouse Queue / Color Cleanup

ORDER TRACKER
- Ready orders are completely removed from the warehouse tracker.
- Once Ready is checked, the order disappears after the save/refresh.
- Ready orders do not reappear under "All Warehouse Orders."
- Removed Ready and Shipped filter options from Tracker.
- Tracker colors:
  * RED remains exactly for overdue / due-today orders that are not Ready.
  * BACK ORDERED charcoal remains.
  * No green, orange, or yellow.

ADMIN ORDERS
- No row/status coloring at all. Orders display white.
- All orders, including Ready and Shipped, remain available through Admin filters.

MOBILE ORDERS
- Red behavior remains for overdue / due-today not Ready.
- Green remains for Ready.
- Back Ordered charcoal and Shipped gray remain.
- Orange and yellow are removed.
- A Ready order due today now displays green instead of yellow.

No SQL migration is required.

UPLOAD
Because app.js and styles.css are shared across pages, safest upload is:
- app.js
- styles.css
- tracker.html
- desktop.html
- mobile.html

The ZIP contains the full current build. Keep config.js unchanged.
