-- Rick Portfolio shared media collection — secure version
-- Run this whole file in Supabase Dashboard -> SQL Editor.
-- BEFORE running: replace YOUR_ADMIN_EMAIL@example.com with the exact email
-- of the single Supabase Auth account that should manage the collection.

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

grant select on public.media_items to anon, authenticated;
grant insert, update, delete on public.media_items to authenticated;

drop policy if exists "Public can read media collection" on public.media_items;
drop policy if exists "Public can insert media collection" on public.media_items;
drop policy if exists "Public can update media collection" on public.media_items;
drop policy if exists "Public can delete media collection" on public.media_items;
drop policy if exists "Admin can insert media collection" on public.media_items;
drop policy if exists "Admin can update media collection" on public.media_items;
drop policy if exists "Admin can delete media collection" on public.media_items;

create policy "Public can read media collection"
on public.media_items for select
to anon, authenticated using (true);

create policy "Admin can insert media collection"
on public.media_items for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com');

create policy "Admin can update media collection"
on public.media_items for update
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com')
with check ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com');

create policy "Admin can delete media collection"
on public.media_items for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com');

insert into storage.buckets (id, name, public)
values ('media-posters', 'media-posters', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read media posters" on storage.objects;
drop policy if exists "Public can upload media posters" on storage.objects;
drop policy if exists "Public can update media posters" on storage.objects;
drop policy if exists "Public can delete media posters" on storage.objects;
drop policy if exists "Admin can upload media posters" on storage.objects;
drop policy if exists "Admin can update media posters" on storage.objects;
drop policy if exists "Admin can delete media posters" on storage.objects;

create policy "Public can read media posters"
on storage.objects for select
to anon, authenticated using (bucket_id = 'media-posters');

create policy "Admin can upload media posters"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media-posters' and (auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com');

create policy "Admin can update media posters"
on storage.objects for update
to authenticated
using (bucket_id = 'media-posters' and (auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com')
with check (bucket_id = 'media-posters' and (auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com');

create policy "Admin can delete media posters"
on storage.objects for delete
to authenticated
using (bucket_id = 'media-posters' and (auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL@example.com');
