B&L Neeley Orders V3.2.2 — Shared Edit / Delivery Method Save Fix

WHY THIS UPDATE:
The app is a shared team order system. If an order was created by one Supabase
user and another authenticated user tried to edit it, older RLS policies could
allow the page to load but silently update zero rows.

INSTALL ORDER:
1. Run migration_v3_2_2_shared_edit.sql in Supabase SQL Editor.
2. Upload the website files from this ZIP to the ROOT of the GitHub repo.
3. Keep config.js unchanged.
4. Refresh the site.

SECURITY:
This does NOT make orders public. Anonymous users still cannot access them.
It allows authenticated users of the B&L Orders app to update/delete shared
orders and order items regardless of who originally entered the order.

APP IMPROVEMENT:
The Edit popup now verifies Supabase actually updated exactly one order before
closing. If an RLS/permission problem happens in the future, the popup will show
a visible error instead of appearing to save and then reverting.
