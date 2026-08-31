# Rick Portfolio — corrected online version

## What was fixed
- Collection now uses Supabase instead of browser IndexedDB/localStorage.
- Add/Edit/Delete are protected by Supabase Auth + RLS; the old JavaScript password is gone.
- The OMDb API key is no longer shipped in browser JavaScript.
- Poster uploads go to the shared Supabase Storage bucket.
- Mobile navigation and reduced-motion behavior are retained.
- Fake placeholder email contact was removed.

## One-time Supabase setup
1. In Supabase Auth, create the one admin user you want to manage the collection.
2. Open `supabase-schema.sql`. Replace `YOUR_ADMIN_EMAIL@example.com` with that exact Auth email. Run the complete SQL file.
3. `supabase-config.js` already contains the browser-safe project URL/publishable key from the supplied project. Do not replace it with a service-role key.
4. The public site can read the collection. Add/Edit/Delete requires the configured admin account.

## Secure IMDb/Rotten Tomatoes auto-fill
The browser no longer contains an OMDb API key. The Fetch button calls the protected `supabase/functions/media-lookup/index.ts` function and requires a signed-in Supabase user.

See `DEPLOY-MEDIA-LOOKUP.md` for the exact Dashboard and CLI steps. The required server secret is:
`OMDB_API_KEY=YOUR_OMDB_KEY`

The website now shows the real function error instead of the generic “auto-fill unavailable” message, making setup problems easier to diagnose.

## Important
The ZIP intentionally does not contain any OMDb secret. If an old OMDb key was ever published, rotate it at OMDb.
