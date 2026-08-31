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

## Secure IMDb/Rotten Tomatoes auto-fill (optional)
The browser no longer contains an OMDb API key. The Fetch button calls `supabase/functions/media-lookup/index.ts`.

Deploy that function with the Supabase CLI and set the secret:
`supabase secrets set OMDB_API_KEY=YOUR_OMDB_KEY`
Then deploy:
`supabase functions deploy media-lookup`

If you do not deploy the function, the collection still works normally; enter media details and upload posters manually.

## Important
The ZIP intentionally does not contain any OMDb secret. If an old OMDb key was ever published, rotate it at OMDb.
