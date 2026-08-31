# Fix IMDb / Rotten Tomatoes Auto-Fill

The website already calls the Supabase Edge Function named `media-lookup`. This folder contains the function; it must be deployed to your Supabase project once.

## Option A — Supabase Dashboard (easiest)

1. Open your Supabase project: `https://supabase.com/dashboard/project/akvhjkbiyqhhxegljucq`
2. Open **Edge Functions**.
3. Create a new function named **`media-lookup`** (or open it if it already exists).
4. Copy the contents of `supabase/functions/media-lookup/index.ts` into the function editor.
5. Deploy the function.
6. Open the function's **Secrets** / project secrets area.
7. Add:
   - Name: `OMDB_API_KEY`
   - Value: your OMDb API key
8. Save the secret. You do not need to put this key in `supabase-config.js` or `script.js`.

## Option B — Supabase CLI

From this project folder:

```bash
supabase login
supabase link --project-ref akvhjkbiyqhhxegljucq
supabase secrets set OMDB_API_KEY=YOUR_OMDB_KEY
supabase functions deploy media-lookup
```

Supabase documents `supabase link`, `supabase functions deploy`, and `supabase secrets set` for production deployments.

## Test

1. Open the website.
2. Click Add Movie / Add Anime / Add Web Series.
3. If you are not signed in, the Admin Login appears automatically.
4. Enter an IMDb URL such as `https://www.imdb.com/title/tt10986410/`.
5. Click **FETCH**.
6. The form should fill with title, year, genres, parts/seasons, rating, description and poster when OMDb provides them.

The OMDb key stays server-side in Supabase. Never paste it into `script.js`, `index.html`, or GitHub Pages.
