B&L Neeley Orders V3.3.3 — Gallon Parser Fix

ROOT CAUSE
The unit parser listed "g" before "gal". JavaScript regex alternation matched
the first valid option, so an entry like:
  4 - 55 gal Sulfuric Acid
was parsed as:
  Qty 4 | Container 55 gal | Product al Sulfuric Acid

FIX
Unit matching now uses the longest gallon words first and a word boundary.

SUPPORTED EXAMPLES
- 1 - 55g Series 420
- 1 - 55 gal Series 420
- 1 - 55 gallon Series 420
- 1 - 55 gallons Series 420
- 1 x 55 gal Series 420
- 1 (55 gallon) Series 420
- 1 - 55 Series 420
- 1 55 Series 420

No SQL migration required.

INSTALL
Upload the website files to the GitHub repo root, keep config.js unchanged,
and confirm pages reference app.js?v=3.3.3.
