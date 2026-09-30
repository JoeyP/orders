B&L Neeley Orders V3.4.6

COLOR RULES
- Back Ordered = charcoal/black (highest priority).
- Past due OR due today + Not Ready = red.
- Due tomorrow + Not Ready = orange.
- Mobile keeps Ready green and Shipped gray.
- Tracker Ready orders still leave the work queue.

BLENDING COMPLETE
- Each selected line item on Blending now has a Complete checkbox.
- Checking Complete sets that exact order_items.requires_blending field to false.
- The item immediately disappears from the active Blending page.
- The same item's Blend checkbox on Admin Orders is therefore unchecked.
- No duplicate completion field/database column is used.

No SQL migration required.

UPLOAD:
- app.js
- styles.css
- blending.html
- tracker.html
- desktop.html
- mobile.html

Keep config.js unchanged.
