-- Public marketing photos; only staff with a live authorised session may upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('spa-catalogue','spa-catalogue',true,5242880,array['image/jpeg','image/png','image/webp']);

create policy spa_catalogue_image_insert on storage.objects for insert to authenticated
with check (
  bucket_id='spa-catalogue'
  and (select spa_private.is_admin())
  and name ~ '^catalogue/[0-9a-f-]{36}\.(jpg|png|webp)$'
);
create policy spa_catalogue_image_read on storage.objects for select to authenticated
using (bucket_id='spa-catalogue' and (select spa_private.is_admin()));
-- Replacements receive a new filename, so no overwrite or delete permission is needed.
