insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('zm-private-documents','zm-private-documents',false,52428800,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']::text[]),
  ('zm-property-media','zm-property-media',false,104857600,array['image/jpeg','image/png','image/webp','image/heic','video/mp4','application/pdf']::text[])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "zm_documents_upload" on storage.objects for insert to authenticated
with check (bucket_id='zm-private-documents' and app_private.has_permission('document.write'));
create policy "zm_documents_read" on storage.objects for select to authenticated
using (bucket_id='zm-private-documents' and exists (
  select 1 from public.document_versions dv join public.documents d on d.id=dv.document_id
  where dv.storage_bucket=storage.objects.bucket_id and dv.storage_path=storage.objects.name
    and ((d.classification <> 'CONFIDENTIAL' and app_private.has_permission('document.read')) or (d.classification='CONFIDENTIAL' and app_private.has_permission('document.confidential.read')))
));
create policy "zm_documents_delete" on storage.objects for delete to authenticated
using (bucket_id='zm-private-documents' and app_private.has_permission('document.write'));

create policy "zm_property_media_upload" on storage.objects for insert to authenticated
with check (bucket_id='zm-property-media' and app_private.has_permission('property.write'));
create policy "zm_property_media_read" on storage.objects for select to authenticated
using (bucket_id='zm-property-media' and app_private.has_permission('property.read'));
create policy "zm_property_media_update" on storage.objects for update to authenticated
using (bucket_id='zm-property-media' and app_private.has_permission('property.write'))
with check (bucket_id='zm-property-media' and app_private.has_permission('property.write'));
create policy "zm_property_media_delete" on storage.objects for delete to authenticated
using (bucket_id='zm-property-media' and app_private.has_permission('property.write'));