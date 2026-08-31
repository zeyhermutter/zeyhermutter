drop function if exists public.match_search_profiles_for_property(uuid,integer);

create function public.match_search_profiles_for_property(p_property_id uuid, p_limit integer default 50)
returns table(
  search_profile_id uuid,
  search_profile_number text,
  contact_id uuid,
  contact_name text,
  profile_title text,
  transaction_type text,
  profile_status text,
  score numeric,
  reasons text[],
  decision_status text,
  locations text[],
  min_price numeric,
  max_price numeric,
  min_living_area numeric,
  max_living_area numeric,
  min_rooms numeric
)
language sql stable set search_path=public,pg_temp as $$
  select
    sp.id,
    sp.search_profile_number,
    sp.contact_id,
    concat_ws(' ',c.first_name,c.last_name),
    sp.title,
    sp.transaction_type,
    sp.status,
    m.score,
    m.reasons,
    m.decision_status,
    coalesce((
      select array_agg(
        trim(concat_ws(' ',sl.postal_code,sl.city))||' · '||trim(to_char(sl.radius_km,'FM999990.##'))||' km'
        order by sl.created_at
      )
      from public.search_profile_locations sl
      where sl.search_profile_id=sp.id
    ),'{}'::text[]),
    sp.min_price,
    sp.max_price,
    sp.min_living_area,
    sp.max_living_area,
    sp.min_rooms
  from public.search_profiles sp
  join public.contacts c on c.id=sp.contact_id
  cross join lateral public.match_properties_for_search_profile(sp.id,500) m
  where sp.archived_at is null
    and sp.status='ACTIVE'
    and m.property_id=p_property_id
  order by m.score desc,sp.search_profile_number
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

revoke all on function public.match_search_profiles_for_property(uuid,integer) from public;
grant execute on function public.match_search_profiles_for_property(uuid,integer) to authenticated;
