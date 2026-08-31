-- Run this entire file in Supabase Dashboard -> SQL Editor.
-- This creates the shared collection table, RLS policies, and poster storage policies.

create table if not exists public.media_items (
  id text primary key,
  type text not null check (type in ('movie', 'anime', 'webseries')),
  name text not null,
  year text,
  genre text,
  parts text,
  rating text,
  description text,
  image_path text,
  added_at timestamptz not null default now()
);

alter table public.media_items enable row level security;

-- Public visitors can read the collection.
create policy "Public can read media collection"
on public.media_items
for select to anon, authenticated
using (true);

-- The current site uses its existing client-side password as a UI gate.
-- IMPORTANT: this is NOT a secure authorization boundary. Anyone who can inspect
-- browser code can call the public API. For a private admin panel, add Supabase Auth.
create policy "Public can insert media collection"
on public.media_items
for insert to anon, authenticated
with check (true);

create policy "Public can update media collection"
on public.media_items
for update to anon, authenticated
using (true) with check (true);

create policy "Public can delete media collection"
on public.media_items
for delete to anon, authenticated
using (true);

-- Required Data API grants for the browser client.
grant select, insert, update, delete on public.media_items to anon, authenticated;

-- Create the poster bucket.
insert into storage.buckets (id, name, public)
values ('media-posters', 'media-posters', true)
on conflict (id) do update set public = true;

-- Storage policies: the bucket is public for viewing, and the site can upload/update/delete posters.
create policy "Public can read media posters"
on storage.objects
for select to anon, authenticated
using (bucket_id = 'media-posters');

create policy "Public can upload media posters"
on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'media-posters');

create policy "Public can update media posters"
on storage.objects
for update to anon, authenticated
using (bucket_id = 'media-posters')
with check (bucket_id = 'media-posters');

create policy "Public can delete media posters"
on storage.objects
for delete to anon, authenticated
using (bucket_id = 'media-posters');
