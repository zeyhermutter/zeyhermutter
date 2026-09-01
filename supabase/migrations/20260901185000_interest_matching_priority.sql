alter table public.search_profile_property_decisions
  drop constraint if exists search_profile_property_decisions_status_check;

alter table public.search_profile_property_decisions
  add constraint search_profile_property_decisions_status_check
  check (status = any (array[
    'SUGGESTED'::text,
    'VIEWED'::text,
    'SENT'::text,
    'REJECTED'::text,
    'INTERESTED'::text,
    'VIEWING_REQUESTED'::text,
    'CONTACT'::text,
    'UNSUITABLE'::text
  ]));

create or replace function public.match_properties_for_search_profile(
  p_search_profile_id uuid,
  p_limit integer default 50
)
returns table(
  property_id uuid,
  property_number text,
  title text,
  city text,
  purchase_or_rent numeric,
  living_area_sqm numeric,
  plot_area_sqm numeric,
  rooms numeric,
  score numeric,
  reasons text[],
  decision_status text
)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  sp public.search_profiles%rowtype;
begin
  if not app_private.has_permission('search_profile.read') then
    raise exception 'SEARCH_PROFILE_READ_REQUIRED' using errcode='42501';
  end if;

  select * into sp
  from public.search_profiles
  where id=p_search_profile_id and archived_at is null;

  if sp.id is null then
    raise exception 'SEARCH_PROFILE_NOT_FOUND' using errcode='P0002';
  end if;

  return query
  with candidate as (
    select
      p.id,
      p.property_number,
      p.internal_title,
      p.property_type,
      p.transaction_type,
      p.status,
      p.purchase_price,
      p.rent_cold,
      p.living_area_sqm,
      p.plot_area_sqm,
      p.rooms,
      p.year_built,
      pa.city as addr_city,
      pa.postal_code,
      pa.district,
      pa.latitude as addr_latitude,
      pa.longitude as addr_longitude,
      d.status as decision_status,
      case when p.transaction_type='SALE' then p.purchase_price else p.rent_cold end as comparison_price,
      coalesce((
        select array_agg(distinct lower(coalesce(pf.label,pf.feature_key)))
        from public.property_features pf
        where pf.property_id=p.id
      ),'{}'::text[]) as feature_labels,
      exists(
        select 1 from public.search_profile_locations sl
        where sl.search_profile_id=sp.id
      ) as has_locations,
      loc.match_rank as location_match_rank,
      loc.location_reason,
      coalesce((
        select count(*)::integer
        from unnest(sp.desired_features) f
        where exists(
          select 1
          from public.property_features pf
          where pf.property_id=p.id
            and lower(coalesce(pf.label,pf.feature_key)) ilike '%'||lower(f)||'%'
        )
      ),0) as feature_matches
    from public.properties p
    left join public.property_addresses pa on pa.property_id=p.id
    left join public.search_profile_property_decisions d
      on d.search_profile_id=sp.id and d.property_id=p.id
    left join lateral (
      select ranked.match_rank, ranked.location_reason
      from (
        select
          case
            when nullif(btrim(sl.postal_code),'') is not null and sl.postal_code=pa.postal_code then 0
            when nullif(btrim(sl.district),'') is not null
              and lower(sl.district)=lower(coalesce(pa.district,''))
              and (sl.city is null or lower(sl.city)=lower(coalesce(pa.city,''))) then 1
            when nullif(btrim(sl.city),'') is not null and lower(sl.city)=lower(coalesce(pa.city,'')) then 2
            when dist.distance_km is not null and dist.distance_km<=sl.radius_km then 3
            else 9
          end as match_rank,
          case
            when nullif(btrim(sl.postal_code),'') is not null and sl.postal_code=pa.postal_code then 'PLZ entspricht Suchgebiet'
            when nullif(btrim(sl.district),'') is not null
              and lower(sl.district)=lower(coalesce(pa.district,''))
              and (sl.city is null or lower(sl.city)=lower(coalesce(pa.city,''))) then 'Ortsteil entspricht Suchgebiet'
            when nullif(btrim(sl.city),'') is not null and lower(sl.city)=lower(coalesce(pa.city,'')) then 'Ort entspricht Suchgebiet'
            when dist.distance_km is not null and dist.distance_km<=sl.radius_km then to_char(dist.distance_km,'FM999990.0')||' km vom Suchort entfernt'
            when dist.distance_km is not null then 'Außerhalb des Radius von '||to_char(sl.radius_km,'FM999990.##')||' km'
            else 'Außerhalb der hinterlegten Suche'
          end as location_reason,
          dist.distance_km
        from public.search_profile_locations sl
        left join lateral (
          select case
            when pa.latitude is not null and pa.longitude is not null and sl.latitude is not null and sl.longitude is not null
            then 6371*2*asin(sqrt(
              power(sin(radians((pa.latitude-sl.latitude)/2)),2)
              + cos(radians(sl.latitude))*cos(radians(pa.latitude))*power(sin(radians((pa.longitude-sl.longitude)/2)),2)
            ))
            else null
          end as distance_km
        ) dist on true
        where sl.search_profile_id=sp.id
      ) ranked
      order by ranked.match_rank, ranked.distance_km nulls last
      limit 1
    ) loc on true
    where p.archived_at is null
      and p.status in ('PREPARATION','MARKETING','RESERVED')
  ),
  scored_base as (
    select
      c.*,
      case
        when c.transaction_type <> case when sp.transaction_type='BUY' then 'SALE' else 'RENT' end then 0::numeric
        when cardinality(sp.property_types)>0 and not (c.property_type=any(sp.property_types)) then 0::numeric
        else greatest(0::numeric,
          100::numeric
          - case
              when sp.min_price is null and sp.max_price is null then 0
              when c.comparison_price is null then 20
              when (sp.min_price is not null and c.comparison_price<sp.min_price)
                or (sp.max_price is not null and c.comparison_price>sp.max_price) then 20
              else 0
            end
          - case
              when sp.min_living_area is null and sp.max_living_area is null then 0
              when c.living_area_sqm is null then 15
              when (sp.min_living_area is not null and c.living_area_sqm<sp.min_living_area)
                or (sp.max_living_area is not null and c.living_area_sqm>sp.max_living_area) then 15
              else 0
            end
          - case when sp.min_plot_area is not null and (c.plot_area_sqm is null or c.plot_area_sqm<sp.min_plot_area) then 10 else 0 end
          - case when sp.min_rooms is not null and (c.rooms is null or c.rooms<sp.min_rooms) then 10 else 0 end
          - case when sp.min_construction_year is not null and (c.year_built is null or c.year_built<sp.min_construction_year) then 5 else 0 end
          - case when c.has_locations and coalesce(c.location_match_rank,9)=9 then 25 else 0 end
          - case
              when cardinality(sp.desired_features)=0 then 0
              else 10 * (cardinality(sp.desired_features)-c.feature_matches)::numeric / cardinality(sp.desired_features)
            end
        )
      end as raw_score,
      array_remove(array[
        case
          when c.transaction_type=case when sp.transaction_type='BUY' then 'SALE' else 'RENT' end then 'Kauf/Miete passt'
          else 'Kauf/Miete passt nicht'
        end,
        case
          when cardinality(sp.property_types)=0 then null
          when c.property_type=any(sp.property_types) then 'Immobilientyp passt'
          else 'Immobilientyp passt nicht'
        end,
        case
          when c.transaction_type <> case when sp.transaction_type='BUY' then 'SALE' else 'RENT' end then null
          when sp.min_price is null and sp.max_price is null then null
          when c.comparison_price is null then 'Preis am Objekt fehlt'
          when (sp.min_price is not null and c.comparison_price<sp.min_price)
            or (sp.max_price is not null and c.comparison_price>sp.max_price) then 'Preis außerhalb des Suchbereichs'
          else 'Preis passt'
        end,
        case
          when sp.min_living_area is null and sp.max_living_area is null then null
          when c.living_area_sqm is null then 'Wohnfläche am Objekt fehlt'
          when (sp.min_living_area is not null and c.living_area_sqm<sp.min_living_area)
            or (sp.max_living_area is not null and c.living_area_sqm>sp.max_living_area) then 'Wohnfläche außerhalb des Suchbereichs'
          else 'Wohnfläche passt'
        end,
        case
          when sp.min_plot_area is null then null
          when c.plot_area_sqm is null or c.plot_area_sqm<sp.min_plot_area then 'Grundstück kleiner als gewünscht'
          else 'Grundstück passt'
        end,
        case
          when sp.min_rooms is null then null
          when c.rooms is null or c.rooms<sp.min_rooms then 'Zu wenige Zimmer'
          else 'Zimmerzahl passt'
        end,
        case
          when sp.min_construction_year is null then null
          when c.year_built is null or c.year_built<sp.min_construction_year then 'Baujahr älter als gewünscht'
          else 'Baujahr passt'
        end,
        case when c.has_locations then coalesce(c.location_reason,'Außerhalb der hinterlegten Suche') else null end,
        case
          when cardinality(sp.desired_features)=0 then null
          when c.feature_matches=cardinality(sp.desired_features) then 'Gewünschte Merkmale passen'
          else format('%s von %s gewünschten Merkmalen vorhanden',c.feature_matches,cardinality(sp.desired_features))
        end,
        case c.status
          when 'MARKETING' then 'Verfügbarkeit: in Vermarktung'
          when 'PREPARATION' then 'Verfügbarkeit: in Vorbereitung'
          when 'RESERVED' then 'Verfügbarkeit: reserviert'
          else null
        end
      ]::text[],null) as base_reasons
    from candidate c
  ),
  scored as (
    select
      sb.*,
      array_prepend(
        case
          when sb.raw_score>=85 then 'Sehr passend'
          when sb.raw_score>=70 then 'Passend'
          when sb.raw_score>=50 then 'Teilweise passend'
          else 'Nicht passend'
        end,
        sb.base_reasons
      ) as grouped_reasons
    from scored_base sb
  )
  select
    s.id,
    s.property_number,
    s.internal_title,
    s.addr_city,
    s.comparison_price,
    s.living_area_sqm,
    s.plot_area_sqm,
    s.rooms,
    round(s.raw_score,2),
    s.grouped_reasons,
    s.decision_status
  from scored s
  order by
    case when s.decision_status in ('REJECTED','UNSUITABLE') then 1 else 0 end,
    case
      when s.raw_score>=85 then 0
      when s.raw_score>=70 then 1
      when s.raw_score>=50 then 2
      else 3
    end,
    case s.decision_status
      when 'VIEWING_REQUESTED' then 0
      when 'CONTACT' then 1
      when 'INTERESTED' then 2
      when 'SENT' then 3
      when 'VIEWED' then 4
      when 'SUGGESTED' then 5
      when 'REJECTED' then 8
      when 'UNSUITABLE' then 9
      else 6
    end,
    case s.status when 'MARKETING' then 0 when 'PREPARATION' then 1 when 'RESERVED' then 2 else 3 end,
    s.raw_score desc,
    s.property_number
  limit greatest(1,least(coalesce(p_limit,50),500));
end;
$function$;

create or replace function public.match_search_profiles_for_property(
  p_property_id uuid,
  p_limit integer default 50
)
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
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
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
  order by
    case when m.decision_status in ('REJECTED','UNSUITABLE') then 1 else 0 end,
    case
      when m.score>=85 then 0
      when m.score>=70 then 1
      when m.score>=50 then 2
      else 3
    end,
    case m.decision_status
      when 'VIEWING_REQUESTED' then 0
      when 'CONTACT' then 1
      when 'INTERESTED' then 2
      when 'SENT' then 3
      when 'VIEWED' then 4
      when 'SUGGESTED' then 5
      when 'REJECTED' then 8
      when 'UNSUITABLE' then 9
      else 6
    end,
    m.score desc,
    sp.search_profile_number
  limit greatest(1,least(coalesce(p_limit,50),200));
$function$;

comment on function public.match_properties_for_search_profile(uuid,integer) is
  'Transparent rule-based property matching. Groups scores into very suitable/suitable/partial/not suitable and de-prioritizes rejected/unsuitable decisions without changing the score.';
comment on function public.match_search_profiles_for_property(uuid,integer) is
  'Reverse matching using the same transparent scoring and decision-aware prioritization as match_properties_for_search_profile.';
