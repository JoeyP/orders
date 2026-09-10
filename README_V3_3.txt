B&L Neeley Orders V3.3 — Verified Edit Save

This is a cleanup of the Edit Order save workflow, not another event-button patch.

WHAT CHANGED
- Header changes (Delivery Method, customer, PO, dates, status) save directly to orders.
- Existing order_items are NOT deleted/recreated unless the actual order lines changed.
- Lot number changes update their existing item rows directly.
- After saving, the app re-reads the order from Supabase and verifies Delivery Method.
- The popup shows "Saving order changes…", "Saved successfully ✓", or the exact database error.
- Save errors now appear ABOVE the buttons where they are visible.

DATABASE
Run migration_v3_3_verified_permissions.sql once. It explicitly defines the
shared-team RLS model for BOTH orders and order_items, including INSERT.

INSTALL
1. Run migration_v3_3_verified_permissions.sql in Supabase SQL Editor.
2. Upload the updated website files to the ROOT of the GitHub orders repo.
3. Keep config.js unchanged.
4. Refresh the site.
