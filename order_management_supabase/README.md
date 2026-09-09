# Order Management – GitHub Pages + Supabase

This version runs from GitHub Pages. Supabase handles email/password login and the shared database.

## Setup
1. Create a Supabase project.
2. In **SQL Editor**, run `database.sql`.
3. In **Authentication → Users**, create one user per employee (or a dedicated blending-screen account).
4. Copy `config.example.js` to `config.js` and replace the project URL and publishable/anon key.
5. Upload the files to GitHub.
6. In **Settings → Pages**, deploy from `main` / root.
7. Open the GitHub Pages URL and sign in.

The app keeps login sessions persistent, has no inactivity logout, and refreshes orders every 60 seconds.

Never put a Supabase service-role key or database password in browser code.
