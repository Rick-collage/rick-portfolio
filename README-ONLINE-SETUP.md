# Rick Portfolio — Online Collection Setup

This version changes the Movies / Anime / Web Series collection from browser-only IndexedDB to Supabase.

## 1. Create a Supabase project
Create a project at https://supabase.com/ and open its SQL Editor.

## 2. Create the database and poster storage
Open `supabase-schema.sql`, copy everything, paste it into Supabase SQL Editor, and run it.

## 3. Get your browser-safe project credentials
In Supabase project settings, copy your Project URL and the publishable/anon browser key.

Never use a `service_role` or secret key in this website.

## 4. Configure the website
Open `supabase-config.js` and replace:

- `YOUR_SUPABASE_PROJECT_URL`
- `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY`

## 5. Upload to GitHub
Upload these files to the root of your `rick-portfolio` repository:

- index.html
- style.css
- script.js
- supabase-config.js

Do not upload the ZIP file itself.

## Important security note
The current website keeps your existing password prompt for the Add/Edit/Delete buttons, but a password stored in browser JavaScript is not a real security boundary. The included SQL therefore allows the public browser role to modify the collection. If you want only you to be able to add/edit/delete while everyone can view, the next step is to add Supabase Auth and protect the write policies with `authenticated`.
