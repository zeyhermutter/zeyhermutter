create or replace function public.crm_global_search(p_query text, p_include_archived boolean default false)
returns table (
  entity_type text,
  entity_id uuid,
  reference text,
  title text,
  subtitle text,
  status text,
  updated_at timestamptz,
  archived boolean,
  version bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with term as (select '%' || trim(coalesce(p_query,'')) || '%' as pattern)
  select 'CONTACT'::text, c.id, c.contact_number, trim(c.first_name || ' ' || c.last_name), coalesce(c.email, c.mobile, c.phone, '—'), c.status, c.updated_at, (c.archived_at is not null), c.version
  from public.contacts c, term t
  where trim(coalesce(p_query,'')) <> '' and (p_include_archived or c.archived_at is null)
    and (c.contact_number ilike t.pattern or c.first_name ilike t.pattern or c.last_name ilike t.pattern or coalesce(c.email,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or exists (select 1 from public.contact_addresses a where a.contact_id=c.id and (p_include_archived or a.archived_at is null) and (a.street ilike t.pattern or a.postal_code ilike t.pattern or a.city ilike t.pattern)))
  union all
  select 'ORGANIZATION'::text, o.id, o.organization_number, o.name, coalesce(nullif(trim(coalesce(o.legal_form,'') || case when o.city is not null then ' · ' || o.city else '' end),''), coalesce(o.email,'—')), o.status, o.updated_at, (o.archived_at is not null), o.version
  from public.organizations o, term t
  where trim(coalesce(p_query,'')) <> '' and (p_include_archived or o.archived_at is null)
    and (o.organization_number ilike t.pattern or o.name ilike t.pattern or coalesce(o.email,'') ilike t.pattern or coalesce(o.phone,'') ilike t.pattern or coalesce(o.city,'') ilike t.pattern)
  union all
  select 'TASK'::text, ta.id, ta.task_number, ta.title, coalesce(ta.description,'—'), ta.status, ta.updated_at, (ta.archived_at is not null), ta.version
  from public.tasks ta, term t
  where trim(coalesce(p_query,'')) <> '' and (p_include_archived or ta.archived_at is null)
    and (ta.task_number ilike t.pattern or ta.title ilike t.pattern or coalesce(ta.description,'') ilike t.pattern)
  order by updated_at desc
  limit 100;
$$;

revoke all on function public.crm_global_search(text,boolean) from public, anon;
grant execute on function public.crm_global_search(text,boolean) to authenticated;

create or replace function public.create_contact_with_primary_address(
  p_first_name text,
  p_last_name text,
  p_email text default null,
  p_phone text default null,
  p_mobile text default null,
  p_salutation text default null,
  p_preferred_channel text default null,
  p_internal_notes text default null,
  p_street text default null,
  p_house_number text default null,
  p_postal_code text default null,
  p_city text default null,
  p_country text default 'DE'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_contact_id uuid;
  v_has_address boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_first_name,'')),'') is null or nullif(trim(coalesce(p_last_name,'')),'') is null then raise exception 'NAME_REQUIRED' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_email,'')),'') is null and nullif(trim(coalesce(p_phone,'')),'') is null and nullif(trim(coalesce(p_mobile,'')),'') is null then raise exception 'CONTACT_METHOD_REQUIRED' using errcode='22023'; end if;

  v_has_address := nullif(trim(coalesce(p_street,'')),'') is not null or nullif(trim(coalesce(p_postal_code,'')),'') is not null or nullif(trim(coalesce(p_city,'')),'') is not null;
  if v_has_address and (nullif(trim(coalesce(p_street,'')),'') is null or nullif(trim(coalesce(p_postal_code,'')),'') is null or nullif(trim(coalesce(p_city,'')),'') is null) then raise exception 'ADDRESS_INCOMPLETE' using errcode='22023'; end if;

  insert into public.contacts (first_name,last_name,email,phone,mobile,salutation,preferred_channel,internal_notes,primary_responsible_user,created_by,updated_by)
  values (trim(p_first_name),trim(p_last_name),nullif(trim(p_email),''),nullif(trim(p_phone),''),nullif(trim(p_mobile),''),nullif(trim(p_salutation),''),nullif(trim(p_preferred_channel),''),nullif(trim(p_internal_notes),''),v_user,v_user,v_user)
  returning id into v_contact_id;

  if v_has_address then
    insert into public.contact_addresses (contact_id,address_type,street,house_number,postal_code,city,country,is_primary,created_by,updated_by)
    values (v_contact_id,'PRIMARY',trim(p_street),nullif(trim(p_house_number),''),trim(p_postal_code),trim(p_city),coalesce(nullif(trim(p_country),''),'DE'),true,v_user,v_user);
  end if;

  return v_contact_id;
end;
$$;

revoke all on function public.create_contact_with_primary_address(text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_contact_with_primary_address(text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
