B&L Neeley Orders V3.3.2 — Edit Field ID Fix

ROOT CAUSE FOUND
The shared PO and Delivery helper functions built Edit IDs as:
  editpo
  editpoFollow
  editdeliveryMethod
  editdeliveryOther

But the actual Edit popup fields are:
  editPo
  editPoFollow
  editDeliveryMethod
  editDeliveryOther

That caused Save Changes to throw a JavaScript error inside getPo('edit')
before the app could show "Saving..." or contact Supabase.

It also prevented the Edit Delivery Method "Other" show/hide behavior from
being wired correctly.

FIX
V3.3.2 uses one fieldId() helper that correctly maps:
  po -> editPo
  poFollow -> editPoFollow
  noPo -> editNoPo
  deliveryMethod -> editDeliveryMethod
  deliveryOtherWrap -> editDeliveryOtherWrap
  deliveryOther -> editDeliveryOther

NO SUPABASE SQL IS REQUIRED.

INSTALL
1. Upload the website files from this ZIP to the ROOT of the GitHub repo.
2. Keep config.js unchanged.
3. Confirm desktop.html loads app.js?v=3.3.2.
4. Refresh and test Edit Order.
