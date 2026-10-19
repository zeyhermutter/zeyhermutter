-- Exposé aus allgemeiner Anfrage und neue Version ersetzt alte (19.10.2026).
-- Freigabe Sebastian: "das müsste doch einfach alle immobilien beinhalten"
-- und "Ja" (ältere freigegebene Version beim Freigeben ersetzen). Nur BETA.
--
-- 1. Eine Anfrage ohne konkretes Objekt ("Keine konkrete Immobilie") kann
--    jedes zur Verwendung freigegebene Exposé bekommen. expose_link_anlegen
--    verlangte bisher, dass Exposé und Anfrage zum selben Objekt gehoeren;
--    bei einer allgemeinen Anfrage gilt jetzt das Objekt des Exposés. Der
--    Objektnachweis erlaubte allgemeine Anfragen schon
--    (validate_property_disclosure: i.property_id is null or ...).
--
-- 2. Wird eine Exposé-Version zur Verwendung freigegeben, werden die bisher
--    freigegebenen Versionen desselben Objekts archiviert. Kurzlinks auf die
--    alte Version oeffnen danach nichts mehr (expose-link prueft RELEASED).
--    Das Archivieren geschieht im Namen dessen, der freigibt -- auch wenn ihm
--    das Recht expose.archive fehlt, denn es ist Teil der Freigabe.
--
-- 3. Einmalig: wo schon heute mehrere Versionen eines Objekts gleichzeitig
--    freigegeben sind, bleibt nur die zuletzt freigegebene.

create or replace function public.expose_link_anlegen(p_inquiry_id uuid, p_expose_id uuid, p_token_hash text)
returns table (id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  anfrage record;
  expose record;
  neu_id uuid;
  neu_bis timestamptz;
begin
  if not app_private.has_permission('expose.read') or not app_private.has_permission('inquiry.read') then
    raise exception 'EXPOSE_LINK_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'EXPOSE_LINK_TOKEN_INVALID' using errcode = '22023';
  end if;
  select i.id, i.property_id, i.contact_id into anfrage from public.inquiries i where i.id = p_inquiry_id;
  if anfrage.id is null then
    raise exception 'EXPOSE_LINK_INQUIRY_INVALID' using errcode = '22023';
  end if;
  select x.id, x.property_id into expose
    from public.property_exposes x
   where x.id = p_expose_id and x.status = 'RELEASED' and x.archived_at is null and x.storage_path is not null;
  -- Allgemeine Anfrage (ohne Objekt): jedes freigegebene Exposé.
  if expose.id is null or (anfrage.property_id is not null and expose.property_id is distinct from anfrage.property_id) then
    raise exception 'EXPOSE_LINK_EXPOSE_NOT_RELEASED' using errcode = '22023';
  end if;
  insert into public.expose_links (token_hash, expose_id, property_id, inquiry_id, contact_id, expires_at)
  values (p_token_hash, expose.id, expose.property_id, anfrage.id, anfrage.contact_id, now() + interval '14 days')
  returning expose_links.id, expose_links.expires_at into neu_id, neu_bis;
  return query select neu_id, neu_bis;
end;
$$;

-- Wie bisher, nur im Uebergang -> ARCHIVED: waehrend des Ersetzens
-- (app.expose_ersetzen = on, nur von der Funktion unten gesetzt) ohne
-- eigene Archivierungspruefung; archived_by ist dann der Freigebende.
create or replace function app_private.property_expose_before_update()
returns trigger
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $function$
declare v_pub_approved timestamptz;
begin
 if row(new.property_id,new.version_number,new.expose_number,new.created_at,new.created_by) is distinct from row(old.property_id,old.version_number,old.expose_number,old.created_at,old.created_by) then raise exception 'EXPOSE_IDENTITY_FIELDS_IMMUTABLE' using errcode='42501'; end if;
 if old.status<>'DRAFT' then if row(new.publication_version_id,new.generator_version,new.title,new.subtitle,new.short_description,new.long_description,new.features_description,new.location_description,new.other_information,new.price,new.currency,new.facts,new.energy,new.source_snapshot,new.source_property_version,new.storage_bucket,new.storage_path,new.original_filename,new.mime_type,new.file_size_bytes,new.sha256,new.generated_at,new.generated_by) is distinct from row(old.publication_version_id,old.generator_version,old.title,old.subtitle,old.short_description,old.long_description,old.features_description,old.location_description,old.other_information,old.price,old.currency,old.facts,old.energy,old.source_snapshot,old.source_property_version,old.storage_bucket,old.storage_path,old.original_filename,old.mime_type,old.file_size_bytes,old.sha256,old.generated_at,old.generated_by) then raise exception 'EXPOSE_CONTENT_IMMUTABLE_AFTER_GENERATION' using errcode='42501'; end if; end if;
 if new.publication_version_id is not null and new.publication_version_id is distinct from old.publication_version_id then if not exists(select 1 from public.property_publication_versions v join public.property_publications p on p.id=v.publication_id where v.id=new.publication_version_id and p.property_id=new.property_id) then raise exception 'EXPOSE_PUBLICATION_VERSION_MISMATCH' using errcode='22023'; end if; end if;
 if new.status is distinct from old.status then
   if old.status='DRAFT' and new.status='GENERATED' then if nullif(trim(coalesce(new.title,'')),'') is null then raise exception 'EXPOSE_TITLE_REQUIRED' using errcode='22023'; end if; if new.storage_bucket is null or new.storage_path is null or new.original_filename is null or new.file_size_bytes is null or new.sha256 is null then raise exception 'EXPOSE_ARTIFACT_REQUIRED' using errcode='22023'; end if; new.mime_type:=coalesce(new.mime_type,'application/pdf');new.generated_at:=coalesce(new.generated_at,now());new.generated_by:=coalesce(new.generated_by,auth.uid());
   elsif old.status='DRAFT' and new.status='ARCHIVED' then if not app_private.has_permission('expose.archive') then raise exception 'EXPOSE_ARCHIVE_REQUIRED' using errcode='42501'; end if; new.archived_at:=now();new.archived_by:=auth.uid();
   elsif old.status='GENERATED' and new.status='APPROVED' then if not app_private.has_permission('expose.approve') then raise exception 'EXPOSE_APPROVE_REQUIRED' using errcode='42501'; end if; if old.publication_version_id is not null then select approved_at into v_pub_approved from public.property_publication_versions where id=old.publication_version_id; if v_pub_approved is null then raise exception 'PUBLICATION_VERSION_NOT_APPROVED' using errcode='22023'; end if; end if; new.approved_at:=now();new.approved_by:=auth.uid();
   elsif old.status='APPROVED' and new.status='RELEASED' then if not app_private.has_permission('expose.approve') then raise exception 'EXPOSE_APPROVE_REQUIRED' using errcode='42501'; end if; new.released_at:=now();new.released_by:=auth.uid();
   elsif old.status in ('GENERATED','APPROVED','RELEASED') and new.status='ARCHIVED' then
     if coalesce(current_setting('app.expose_ersetzen', true), '') = 'on' and old.status = 'RELEASED' then
       new.archived_at:=now();new.archived_by:=coalesce(auth.uid(), new.archived_by);
     else
       if not app_private.has_permission('expose.archive') then raise exception 'EXPOSE_ARCHIVE_REQUIRED' using errcode='42501'; end if; new.archived_at:=now();new.archived_by:=auth.uid();
     end if;
   else raise exception 'INVALID_EXPOSE_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023'; end if;
 else if row(new.approved_at,new.approved_by,new.released_at,new.released_by,new.archived_at,new.archived_by) is distinct from row(old.approved_at,old.approved_by,old.released_at,old.released_by,old.archived_at,old.archived_by) then raise exception 'EXPOSE_WORKFLOW_FIELDS_PROTECTED' using errcode='42501'; end if; end if;
 new.updated_at:=now();new.updated_by:=auth.uid();new.version:=old.version+1; return new; end;
$function$;

create or replace function app_private.expose_vorgaenger_ersetzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.expose_ersetzen', 'on', true);
  update public.property_exposes
     set status = 'ARCHIVED', archived_by = new.released_by
   where property_id = new.property_id and id <> new.id and status = 'RELEASED';
  perform set_config('app.expose_ersetzen', '', true);
  return null;
end;
$$;

revoke all on function app_private.expose_vorgaenger_ersetzen() from public, anon, authenticated;

create trigger property_exposes_30_vorgaenger_ersetzen
  after update of status on public.property_exposes
  for each row
  when (new.status = 'RELEASED' and old.status is distinct from 'RELEASED')
  execute function app_private.expose_vorgaenger_ersetzen();

-- 3. Einmalig: je Objekt nur die zuletzt freigegebene Version behalten.
do $$
begin
  perform set_config('app.expose_ersetzen', 'on', true);
  update public.property_exposes e
     set status = 'ARCHIVED', archived_by = n.released_by
    from (select distinct on (property_id) property_id, id, released_by
            from public.property_exposes
           where status = 'RELEASED'
           order by property_id, released_at desc nulls last, version_number desc) n
   where e.property_id = n.property_id and e.id <> n.id and e.status = 'RELEASED';
  perform set_config('app.expose_ersetzen', '', true);
end $$;
