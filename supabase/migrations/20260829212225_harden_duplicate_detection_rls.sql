create or replace function public.find_contact_duplicates(
  p_first_name text,
  p_last_name text,
  p_email text default null,
  p_mobile text default null,
  p_street text default null,
  p_house_number text default null,
  p_postal_code text default null,
  p_city text default null,
  p_exclude_contact_id uuid default null
)
returns table (
  contact_id uuid,
  contact_number text,
  first_name text,
  last_name text,
  email text,
  mobile text,
  reasons text[]
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with candidates as (
    select
      c.id,
      c.contact_number,
      c.first_name,
      c.last_name,
      c.email,
      c.mobile,
      array_remove(array[
        case when nullif(trim(p_email),'') is not null
          and lower(trim(coalesce(c.email,''))) = lower(trim(p_email)) then 'EMAIL' end,
        case when nullif(regexp_replace(coalesce(p_mobile,''),'\D','','g'),'') is not null
          and regexp_replace(coalesce(c.mobile,''),'\D','','g') = regexp_replace(p_mobile,'\D','','g') then 'MOBILE' end,
        case when lower(trim(c.first_name)) = lower(trim(coalesce(p_first_name,'')))
          and lower(trim(c.last_name)) = lower(trim(coalesce(p_last_name,'')))
          and nullif(trim(p_postal_code),'') is not null
          and exists (
            select 1 from public.contact_addresses a
            where a.contact_id = c.id
              and a.archived_at is null
              and lower(trim(a.postal_code)) = lower(trim(p_postal_code))
              and lower(trim(a.city)) = lower(trim(coalesce(p_city,'')))
              and lower(trim(a.street)) = lower(trim(coalesce(p_street,'')))
              and lower(trim(coalesce(a.house_number,''))) = lower(trim(coalesce(p_house_number,'')))
          ) then 'NAME_ADDRESS' end,
        case when lower(trim(c.first_name)) = lower(trim(coalesce(p_first_name,'')))
          and lower(trim(c.last_name)) = lower(trim(coalesce(p_last_name,''))) then 'NAME' end
      ], null) as match_reasons
    from public.contacts c
    where c.archived_at is null
      and (p_exclude_contact_id is null or c.id <> p_exclude_contact_id)
  )
  select id, contact_number, first_name, last_name, email, mobile, match_reasons
  from candidates
  where cardinality(match_reasons) > 0
    and ('EMAIL' = any(match_reasons) or 'MOBILE' = any(match_reasons) or 'NAME_ADDRESS' = any(match_reasons))
  order by contact_number
  limit 10;
$$;

revoke all on function public.find_contact_duplicates(text,text,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.find_contact_duplicates(text,text,text,text,text,text,text,text,uuid) to authenticated;
