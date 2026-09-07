-- Thema 3: Exposés als bearbeitbarer, versionierter Arbeitsbereich

alter table public.property_exposes
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists title text,
  add column if not exists subtitle text,
  add column if not exists short_description text,
  add column if not exists long_description text,
  add column if not exists features_description text,
  add column if not exists location_description text,
  add column if not exists other_information text,
  add column if not exists price numeric(14,2),
  add column if not exists currency text not null default 'EUR',
  add column if not exists facts jsonb not null default '{}'::jsonb,
  add column if not exists energy jsonb not null default '{}'::jsonb,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists source_property_version bigint;

update public.property_exposes set created_by=coalesce(created_by,generated_by,updated_by) where created_by is null;

alter table public.property_exposes alter column publication_version_id drop not null;
alter table public.property_exposes alter column storage_bucket drop not null;
alter table public.property_exposes alter column storage_path drop not null;
alter table public.property_exposes alter column original_filename drop not null;
alter table public.property_exposes alter column mime_type drop not null;
alter table public.property_exposes alter column file_size_bytes drop not null;
alter table public.property_exposes alter column sha256 drop not null;
alter table public.property_exposes alter column generated_at drop not null;
alter table public.property_exposes alter column status set default 'DRAFT';

alter table public.property_exposes drop constraint if exists property_exposes_status_check;
alter table public.property_exposes add constraint property_exposes_status_check check(status in ('DRAFT','GENERATED','APPROVED','RELEASED','ARCHIVED'));
alter table public.property_exposes drop constraint if exists property_exposes_file_size_bytes_check;
alter table public.property_exposes add constraint property_exposes_file_size_bytes_check check(file_size_bytes is null or file_size_bytes>0);
alter table public.property_exposes drop constraint if exists property_exposes_sha256_check;
alter table public.property_exposes add constraint property_exposes_sha256_check check(sha256 is null or sha256 ~ '^[a-fA-F0-9]{64}$');
alter table public.property_exposes drop constraint if exists property_exposes_mime_type_check;
alter table public.property_exposes add constraint property_exposes_mime_type_check check(mime_type is null or mime_type='application/pdf');
alter table public.property_exposes drop constraint if exists property_exposes_publication_version_id_generator_version_key;
alter table public.property_exposes add constraint property_exposes_price_check check(price is null or price>=0);
alter table public.property_exposes add constraint property_exposes_currency_check check(currency='EUR');
alter table public.property_exposes add constraint property_exposes_facts_object_check check(jsonb_typeof(facts)='object');
alter table public.property_exposes add constraint property_exposes_energy_object_check check(jsonb_typeof(energy)='object');
alter table public.property_exposes add constraint property_exposes_source_snapshot_object_check check(jsonb_typeof(source_snapshot)='object');

create table if not exists public.property_expose_media(
  id uuid primary key default gen_random_uuid(),
  expose_id uuid not null references public.property_exposes(id) on delete cascade,
  media_id uuid not null references public.property_media(id) on delete restrict,
  role text not null check(role in ('COVER','GALLERY','FLOOR_PLAN')),
  sort_order integer not null default 0 check(sort_order>=0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  version bigint not null default 1 check(version>0),
  unique(expose_id,media_id),
  unique(expose_id,role,sort_order)
);
create unique index if not exists property_expose_one_cover_idx on public.property_expose_media(expose_id) where role='COVER';
create index if not exists property_expose_media_expose_idx on public.property_expose_media(expose_id,role,sort_order);
create index if not exists property_expose_media_media_idx on public.property_expose_media(media_id);

alter table public.property_expose_media enable row level security;
drop policy if exists property_expose_media_select on public.property_expose_media;
create policy property_expose_media_select on public.property_expose_media for select to authenticated using(app_private.has_permission('expose.read'));
drop policy if exists property_expose_media_insert on public.property_expose_media;
create policy property_expose_media_insert on public.property_expose_media for insert to authenticated with check(app_private.has_permission('expose.write') and created_by=(select auth.uid()));
drop policy if exists property_expose_media_update on public.property_expose_media;
create policy property_expose_media_update on public.property_expose_media for update to authenticated using(app_private.has_permission('expose.write')) with check(app_private.has_permission('expose.write'));
drop policy if exists property_expose_media_delete on public.property_expose_media;
create policy property_expose_media_delete on public.property_expose_media for delete to authenticated using(app_private.has_permission('expose.write'));

drop policy if exists property_exposes_insert on public.property_exposes;
create policy property_exposes_insert on public.property_exposes for insert to authenticated
with check(app_private.has_permission('expose.write') and created_by=(select auth.uid()));

create or replace function app_private.property_expose_before_insert()
returns trigger language plpgsql security definer set search_path to 'app_private','public','pg_temp' as $function$
declare v_publication_property uuid;
begin
 if not app_private.has_permission('expose.write') then raise exception 'EXPOSE_WRITE_REQUIRED' using errcode='42501'; end if;
 perform 1 from public.properties where id=new.property_id for update;
 if not found then raise exception 'PROPERTY_NOT_FOUND' using errcode='P0002'; end if;
 if new.publication_version_id is not null then
   select p.property_id into v_publication_property from public.property_publication_versions v join public.property_publications p on p.id=v.publication_id where v.id=new.publication_version_id;
   if v_publication_property is null or v_publication_property<>new.property_id then raise exception 'EXPOSE_PUBLICATION_VERSION_MISMATCH' using errcode='22023'; end if;
 end if;
 new.version_number:=coalesce((select max(e.version_number) from public.property_exposes e where e.property_id=new.property_id),0)+1;
 new.created_by:=coalesce(new.created_by,auth.uid());new.updated_by:=auth.uid();new.updated_at:=now();new.version:=1;
 new.approved_at:=null;new.approved_by:=null;new.released_at:=null;new.released_by:=null;new.archived_at:=null;new.archived_by:=null;
 if new.status='DRAFT' then
   new.generated_at:=null;new.generated_by:=null;new.storage_bucket:=null;new.storage_path:=null;new.original_filename:=null;new.mime_type:=null;new.file_size_bytes:=null;new.sha256:=null;
 elsif new.status='GENERATED' then
   if new.storage_bucket is null or new.storage_path is null or new.original_filename is null or new.file_size_bytes is null or new.sha256 is null then raise exception 'EXPOSE_ARTIFACT_REQUIRED' using errcode='22023'; end if;
   new.mime_type:=coalesce(new.mime_type,'application/pdf');new.generated_at:=coalesce(new.generated_at,now());new.generated_by:=coalesce(new.generated_by,auth.uid());
 else
   raise exception 'EXPOSE_MUST_START_DRAFT_OR_GENERATED' using errcode='22023';
 end if;
 return new;
end;$function$;

create or replace function app_private.property_expose_before_update()
returns trigger language plpgsql security definer set search_path to 'app_private','public','pg_temp' as $function$
declare v_pub_approved timestamptz;
begin
 if row(new.property_id,new.version_number,new.expose_number,new.created_at,new.created_by)
    is distinct from row(old.property_id,old.version_number,old.expose_number,old.created_at,old.created_by) then
   raise exception 'EXPOSE_IDENTITY_FIELDS_IMMUTABLE' using errcode='42501';
 end if;

 if old.status<>'DRAFT' then
   if row(new.publication_version_id,new.generator_version,new.title,new.subtitle,new.short_description,new.long_description,new.features_description,new.location_description,new.other_information,new.price,new.currency,new.facts,new.energy,new.source_snapshot,new.source_property_version,new.storage_bucket,new.storage_path,new.original_filename,new.mime_type,new.file_size_bytes,new.sha256,new.generated_at,new.generated_by)
      is distinct from row(old.publication_version_id,old.generator_version,old.title,old.subtitle,old.short_description,old.long_description,old.features_description,old.location_description,old.other_information,old.price,old.currency,old.facts,old.energy,old.source_snapshot,old.source_property_version,old.storage_bucket,old.storage_path,old.original_filename,old.mime_type,old.file_size_bytes,old.sha256,old.generated_at,old.generated_by) then
     raise exception 'EXPOSE_CONTENT_IMMUTABLE_AFTER_GENERATION' using errcode='42501';
   end if;
 end if;

 if new.publication_version_id is not null and new.publication_version_id is distinct from old.publication_version_id then
   if not exists(select 1 from public.property_publication_versions v join public.property_publications p on p.id=v.publication_id where v.id=new.publication_version_id and p.property_id=new.property_id) then raise exception 'EXPOSE_PUBLICATION_VERSION_MISMATCH' using errcode='22023'; end if;
 end if;

 if new.status is distinct from old.status then
   if old.status='DRAFT' and new.status='GENERATED' then
     if nullif(trim(coalesce(new.title,'')),'') is null then raise exception 'EXPOSE_TITLE_REQUIRED' using errcode='22023'; end if;
     if new.storage_bucket is null or new.storage_path is null or new.original_filename is null or new.file_size_bytes is null or new.sha256 is null then raise exception 'EXPOSE_ARTIFACT_REQUIRED' using errcode='22023'; end if;
     new.mime_type:=coalesce(new.mime_type,'application/pdf');new.generated_at:=coalesce(new.generated_at,now());new.generated_by:=coalesce(new.generated_by,auth.uid());
   elsif old.status='DRAFT' and new.status='ARCHIVED' then
     if not app_private.has_permission('expose.archive') then raise exception 'EXPOSE_ARCHIVE_REQUIRED' using errcode='42501'; end if;
     new.archived_at:=now();new.archived_by:=auth.uid();
   elsif old.status='GENERATED' and new.status='APPROVED' then
     if not app_private.has_permission('expose.approve') then raise exception 'EXPOSE_APPROVE_REQUIRED' using errcode='42501'; end if;
     if old.publication_version_id is not null then select approved_at into v_pub_approved from public.property_publication_versions where id=old.publication_version_id; if v_pub_approved is null then raise exception 'PUBLICATION_VERSION_NOT_APPROVED' using errcode='22023'; end if; end if;
     new.approved_at:=now();new.approved_by:=auth.uid();
   elsif old.status='APPROVED' and new.status='RELEASED' then
     if not app_private.has_permission('expose.approve') then raise exception 'EXPOSE_APPROVE_REQUIRED' using errcode='42501'; end if;
     new.released_at:=now();new.released_by:=auth.uid();
   elsif old.status in ('GENERATED','APPROVED','RELEASED') and new.status='ARCHIVED' then
     if not app_private.has_permission('expose.archive') then raise exception 'EXPOSE_ARCHIVE_REQUIRED' using errcode='42501'; end if;
     new.archived_at:=now();new.archived_by:=auth.uid();
   else
     raise exception 'INVALID_EXPOSE_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
   end if;
 else
   if row(new.approved_at,new.approved_by,new.released_at,new.released_by,new.archived_at,new.archived_by)
      is distinct from row(old.approved_at,old.approved_by,old.released_at,old.released_by,old.archived_at,old.archived_by) then raise exception 'EXPOSE_WORKFLOW_FIELDS_PROTECTED' using errcode='42501'; end if;
 end if;
 new.updated_at:=now();new.updated_by:=auth.uid();new.version:=old.version+1;
 return new;
end;$function$;

create or replace function app_private.validate_property_expose_media()
returns trigger language plpgsql security definer set search_path to 'app_private','public','pg_temp' as $function$
declare v_expose_status text;v_property_id uuid;v_media_property uuid;v_media_type text;
begin
 select status,property_id into v_expose_status,v_property_id from public.property_exposes where id=coalesce(new.expose_id,old.expose_id);
 if v_expose_status is null then raise exception 'EXPOSE_NOT_FOUND' using errcode='P0002'; end if;
 if v_expose_status<>'DRAFT' then raise exception 'EXPOSE_MEDIA_IMMUTABLE_AFTER_GENERATION' using errcode='42501'; end if;
 if tg_op<>'DELETE' then
   select property_id,media_type into v_media_property,v_media_type from public.property_media where id=new.media_id and archived_at is null;
   if v_media_property is null or v_media_property<>v_property_id then raise exception 'EXPOSE_MEDIA_PROPERTY_MISMATCH' using errcode='22023'; end if;
   if new.role='FLOOR_PLAN' and v_media_type<>'FLOOR_PLAN' then raise exception 'EXPOSE_FLOOR_PLAN_MEDIA_REQUIRED' using errcode='22023'; end if;
   if new.role in ('COVER','GALLERY') and v_media_type<>'IMAGE' then raise exception 'EXPOSE_IMAGE_MEDIA_REQUIRED' using errcode='22023'; end if;
 end if;
 return coalesce(new,old);
end;$function$;

drop trigger if exists property_expose_media_validate on public.property_expose_media;
create trigger property_expose_media_validate before insert or update or delete on public.property_expose_media for each row execute function app_private.validate_property_expose_media();
drop trigger if exists property_expose_media_set_metadata on public.property_expose_media;
create trigger property_expose_media_set_metadata before update on public.property_expose_media for each row execute function app_private.set_business_update_metadata();
drop trigger if exists property_expose_media_audit on public.property_expose_media;
create trigger property_expose_media_audit after insert or update or delete on public.property_expose_media for each row execute function app_private.audit_row_change('PROPERTY_EXPOSE_MEDIA','id');

create index if not exists property_exposes_created_by_idx on public.property_exposes(created_by) where created_by is not null;
create index if not exists property_exposes_publication_version_idx on public.property_exposes(publication_version_id) where publication_version_id is not null;
