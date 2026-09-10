B&L Neeley Orders V3.3.1 — Direct Save Button Fix

WHAT THIS FIXES
Cancel and Delete were working because they used direct click handlers.
Save Changes was still relying on the browser's form-submit event.

V3.3.1 changes Save Changes to a normal button and calls saveEditOrder()
directly from the same delegated click handler used by Cancel/Delete.

NO SUPABASE SQL/MIGRATION IS REQUIRED FOR THIS UPDATE.

INSTALL
1. Upload the website files from this ZIP to the ROOT of the GitHub repo.
2. Keep config.js unchanged.
3. Refresh the site.
4. Confirm desktop.html references app.js?v=3.3.1.
