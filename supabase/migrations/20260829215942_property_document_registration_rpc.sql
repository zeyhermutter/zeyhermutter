create or replace function public.create_property_document_version(
  p_property_id uuid,
  p_category text,
  p_classification text,
  p_title text,
  p_description text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text,
  p_change_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_document_id uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.properties p where p.id=p_property_id) then raise exception 'property not found'; end if;
  insert into public.documents(property_id,category,classification,title,description,created_by,updated_by)
  values(p_property_id,p_category,p_classification,trim(p_title),nullif(trim(coalesce(p_description,'')),''),v_user,v_user)
  returning id into v_document_id;
  insert into public.document_versions(document_id,storage_bucket,storage_path,original_filename,mime_type,file_size_bytes,sha256,change_reason,uploaded_by)
  values(v_document_id,'zm-private-documents',p_storage_path,p_original_filename,p_mime_type,p_file_size_bytes,p_sha256,nullif(trim(coalesce(p_change_reason,'')),''),v_user);
  return v_document_id;
end;
$$;
revoke all on function public.create_property_document_version(uuid,text,text,text,text,text,text,text,bigint,text,text) from public,anon;
grant execute on function public.create_property_document_version(uuid,text,text,text,text,text,text,text,bigint,text,text) to authenticated;

create or replace function public.add_property_document_version(
  p_document_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text,
  p_change_reason text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_version integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.documents d where d.id=p_document_id and d.archived_at is null) then raise exception 'document not found'; end if;
  insert into public.document_versions(document_id,storage_bucket,storage_path,original_filename,mime_type,file_size_bytes,sha256,change_reason,uploaded_by)
  values(p_document_id,'zm-private-documents',p_storage_path,p_original_filename,p_mime_type,p_file_size_bytes,p_sha256,nullif(trim(coalesce(p_change_reason,'')),''),v_user)
  returning version_number into v_version;
  return v_version;
end;
$$;
revoke all on function public.add_property_document_version(uuid,text,text,text,bigint,text,text) from public,anon;
grant execute on function public.add_property_document_version(uuid,text,text,text,bigint,text,text) to authenticated;