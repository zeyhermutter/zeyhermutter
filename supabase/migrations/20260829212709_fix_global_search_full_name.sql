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
  select 'CONTACT'::text, c.id, c.contact_number,
         trim(c.first_name || ' ' || c.last_name),
         coalesce(c.email, c.mobile, c.phone, '—'),
         c.status, c.updated_at, (c.archived_at is not null), c.version
  from public.contacts c, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or c.archived_at is null)
    and (
      c.contact_number ilike t.pattern or
      trim(c.first_name || ' ' || c.last_name) ilike t.pattern or
      trim(c.last_name || ' ' || c.first_name) ilike t.pattern or
      c.first_name ilike t.pattern or
      c.last_name ilike t.pattern or
      coalesce(c.email,'') ilike t.pattern or
      coalesce(c.mobile,'') ilike t.pattern or
      coalesce(c.phone,'') ilike t.pattern or
      exists (
        select 1 from public.contact_addresses a
        where a.contact_id = c.id
          and (p_include_archived or a.archived_at is null)
          and (
            trim(a.street || ' ' || coalesce(a.house_number,'')) ilike t.pattern or
            trim(a.postal_code || ' ' || a.city) ilike t.pattern or
            a.street ilike t.pattern or a.postal_code ilike t.pattern or a.city ilike t.pattern
          )
      )
    )
  union all
  select 'ORGANIZATION'::text, o.id, o.organization_number, o.name,
         coalesce(nullif(trim(coalesce(o.legal_form,'') || case when o.city is not null then ' · ' || o.city else '' end),''), coalesce(o.email,'—')),
         o.status, o.updated_at, (o.archived_at is not null), o.version
  from public.organizations o, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or o.archived_at is null)
    and (o.organization_number ilike t.pattern or o.name ilike t.pattern or coalesce(o.email,'') ilike t.pattern or coalesce(o.phone,'') ilike t.pattern or coalesce(o.city,'') ilike t.pattern)
  union all
  select 'TASK'::text, ta.id, ta.task_number, ta.title,
         coalesce(ta.description,'—'), ta.status, ta.updated_at,
         (ta.archived_at is not null), ta.version
  from public.tasks ta, term t
  where trim(coalesce(p_query,'')) <> ''
    and (p_include_archived or ta.archived_at is null)
    and (ta.task_number ilike t.pattern or ta.title ilike t.pattern or coalesce(ta.description,'') ilike t.pattern)
  order by updated_at desc
  limit 100;
$$;

revoke all on function public.crm_global_search(text,boolean) from public, anon;
grant execute on function public.crm_global_search(text,boolean) to authenticated;
