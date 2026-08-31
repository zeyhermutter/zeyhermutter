alter table public.inquiries add column if not exists answered_at timestamptz;
alter table public.inquiries add column if not exists lost_reason text;

alter table public.inquiries drop constraint if exists inquiries_status_check;
alter table public.inquiries add constraint inquiries_status_check check (status in ('NEW','CONTACTED','QUALIFIED','VIEWING_PLANNED','CLOSED','LOST'));

create table public.inquiry_status_transitions (
  from_status text not null,
  to_status text not null,
  description text,
  primary key (from_status,to_status)
);

insert into public.inquiry_status_transitions(from_status,to_status,description) values
('NEW','CONTACTED','Kontakt aufnehmen'),
('NEW','CLOSED','Direkt erledigen'),
('NEW','LOST','Kein weiteres Interesse'),
('CONTACTED','NEW','Zurück auf neu'),
('CONTACTED','QUALIFIED','Anfrage qualifizieren'),
('CONTACTED','CLOSED','Erledigen'),
('CONTACTED','LOST','Kein weiteres Interesse'),
('QUALIFIED','CONTACTED','Zurück zu kontaktiert'),
('QUALIFIED','VIEWING_PLANNED','Besichtigung planen'),
('QUALIFIED','CLOSED','Erledigen'),
('QUALIFIED','LOST','Kein weiteres Interesse'),
('VIEWING_PLANNED','QUALIFIED','Besichtigung zurücknehmen'),
('VIEWING_PLANNED','CLOSED','Erledigen'),
('VIEWING_PLANNED','LOST','Kein weiteres Interesse'),
('CLOSED','CONTACTED','Wieder öffnen'),
('LOST','CONTACTED','Wieder aufnehmen')
on conflict do nothing;

grant select on public.inquiry_status_transitions to authenticated;

create or replace function app_private.validate_inquiry_business_rules()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if tg_op='UPDATE' and old.status is distinct from new.status then
    if not exists (
      select 1 from public.inquiry_status_transitions t
      where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_INQUIRY_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;
  end if;

  if new.status='LOST' and nullif(trim(coalesce(new.lost_reason,'')),'') is null then
    raise exception 'INQUIRY_LOST_REASON_REQUIRED' using errcode='22023';
  end if;
  if new.status<>'LOST' then new.lost_reason:=null; end if;

  if tg_op='UPDATE' and old.status='NEW' and new.status='CONTACTED' and new.answered_at is null then
    new.answered_at:=now();
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_inquiry_business_rules() from public;

drop trigger if exists inquiries_20_validate_business on public.inquiries;
create trigger inquiries_20_validate_business before insert or update on public.inquiries
for each row execute function app_private.validate_inquiry_business_rules();

alter table public.activity_events add column if not exists inquiry_id uuid references public.inquiries(id) on delete set null;
alter table public.activity_events add column if not exists search_profile_id uuid references public.search_profiles(id) on delete set null;
create index if not exists activity_events_inquiry_idx on public.activity_events(inquiry_id,occurred_at desc) where inquiry_id is not null;
create index if not exists activity_events_search_profile_idx on public.activity_events(search_profile_id,occurred_at desc) where search_profile_id is not null;

drop policy if exists activity_events_select_crm on public.activity_events;
create policy activity_events_select_crm on public.activity_events for select using (
 ((contact_id is not null) and app_private.has_permission('contact.read')) or
 ((property_id is not null) and app_private.has_permission('property.read')) or
 ((lead_id is not null) and app_private.has_permission('lead.read')) or
 ((inquiry_id is not null) and app_private.has_permission('inquiry.read')) or
 ((search_profile_id is not null) and app_private.has_permission('search_profile.read')) or
 ((contact_id is null) and (property_id is null) and (lead_id is null) and (inquiry_id is null) and (search_profile_id is null) and app_private.has_permission('audit.read'))
);

drop policy if exists activity_events_insert_crm on public.activity_events;
create policy activity_events_insert_crm on public.activity_events for insert with check (
 actor_user_id=(select auth.uid()) and (
  ((contact_id is not null) and app_private.has_permission('contact.write')) or
  ((property_id is not null) and app_private.has_permission('property.write')) or
  ((lead_id is not null) and app_private.has_permission('lead.write')) or
  ((inquiry_id is not null) and app_private.has_permission('inquiry.write')) or
  ((search_profile_id is not null) and app_private.has_permission('search_profile.write')) or
  ((contact_id is null) and (property_id is null) and (lead_id is null) and (inquiry_id is null) and (search_profile_id is null))
 )
);

drop policy if exists comments_select_crm on public.comments;
create policy comments_select_crm on public.comments for select using (
 ((entity_type in ('CONTACT','ORGANIZATION')) and app_private.has_permission('contact.read')) or
 ((entity_type='TASK') and app_private.has_permission('task.read')) or
 ((entity_type='LEAD') and app_private.has_permission('lead.read')) or
 ((entity_type='SEARCH_PROFILE') and app_private.has_permission('search_profile.read')) or
 ((entity_type='INQUIRY') and app_private.has_permission('inquiry.read'))
);

drop policy if exists comments_insert_crm on public.comments;
create policy comments_insert_crm on public.comments for insert with check (
 author_user_id=(select auth.uid()) and (
  ((entity_type in ('CONTACT','ORGANIZATION')) and app_private.has_permission('contact.write')) or
  ((entity_type='TASK') and app_private.has_permission('task.write')) or
  ((entity_type='LEAD') and app_private.has_permission('lead.write')) or
  ((entity_type='SEARCH_PROFILE') and app_private.has_permission('search_profile.write')) or
  ((entity_type='INQUIRY') and app_private.has_permission('inquiry.write'))
 )
);

create or replace function public.create_search_profile_comment(p_search_profile_id uuid,p_body text,p_mentioned_user_ids uuid[] default '{}'::uuid[])
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_comment_id uuid; v_mentioned uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not app_private.has_permission('search_profile.write') then raise exception 'SEARCH_PROFILE_WRITE_REQUIRED' using errcode='42501'; end if;
 if nullif(trim(coalesce(p_body,'')),'') is null then raise exception 'COMMENT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.search_profiles s where s.id=p_search_profile_id and s.archived_at is null) then raise exception 'SEARCH_PROFILE_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.comments(entity_type,entity_id,body,author_user_id) values('SEARCH_PROFILE',p_search_profile_id,trim(p_body),v_user) returning id into v_comment_id;
 for v_mentioned in select distinct x from unnest(coalesce(p_mentioned_user_ids,'{}'::uuid[])) x where x<>v_user loop
  insert into public.comment_mentions(comment_id,mentioned_user_id) values(v_comment_id,v_mentioned) on conflict do nothing;
 end loop;
 return v_comment_id;
end;
$$;
revoke all on function public.create_search_profile_comment(uuid,text,uuid[]) from public,anon;
grant execute on function public.create_search_profile_comment(uuid,text,uuid[]) to authenticated;

create or replace function public.create_inquiry_comment(p_inquiry_id uuid,p_body text,p_mentioned_user_ids uuid[] default '{}'::uuid[])
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_comment_id uuid; v_mentioned uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not app_private.has_permission('inquiry.write') then raise exception 'INQUIRY_WRITE_REQUIRED' using errcode='42501'; end if;
 if nullif(trim(coalesce(p_body,'')),'') is null then raise exception 'COMMENT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.inquiries i where i.id=p_inquiry_id and i.archived_at is null) then raise exception 'INQUIRY_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.comments(entity_type,entity_id,body,author_user_id) values('INQUIRY',p_inquiry_id,trim(p_body),v_user) returning id into v_comment_id;
 for v_mentioned in select distinct x from unnest(coalesce(p_mentioned_user_ids,'{}'::uuid[])) x where x<>v_user loop
  insert into public.comment_mentions(comment_id,mentioned_user_id) values(v_comment_id,v_mentioned) on conflict do nothing;
 end loop;
 return v_comment_id;
end;
$$;
revoke all on function public.create_inquiry_comment(uuid,text,uuid[]) from public,anon;
grant execute on function public.create_inquiry_comment(uuid,text,uuid[]) to authenticated;

create table public.search_profile_property_decisions (
 id uuid primary key default gen_random_uuid(),
 search_profile_id uuid not null references public.search_profiles(id) on delete cascade,
 property_id uuid not null references public.properties(id) on delete cascade,
 status text not null check(status in ('SUGGESTED','VIEWED','SENT','REJECTED','INTERESTED','VIEWING_REQUESTED')),
 note text,
 last_match_score numeric(5,2) check(last_match_score is null or last_match_score between 0 and 100),
 decided_at timestamptz not null default now(),
 decided_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 updated_at timestamptz not null default now(),
 updated_by uuid default auth.uid(),
 version bigint not null default 1,
 unique(search_profile_id,property_id)
);
create index search_profile_property_decisions_profile_idx on public.search_profile_property_decisions(search_profile_id,status);
create index search_profile_property_decisions_property_idx on public.search_profile_property_decisions(property_id,status);
alter table public.search_profile_property_decisions enable row level security;
create policy search_profile_property_decisions_select on public.search_profile_property_decisions for select using(app_private.has_permission('search_profile.read'));
create policy search_profile_property_decisions_insert on public.search_profile_property_decisions for insert with check(app_private.has_permission('search_profile.write') and created_by=(select auth.uid()));
create policy search_profile_property_decisions_update on public.search_profile_property_decisions for update using(app_private.has_permission('search_profile.write')) with check(app_private.has_permission('search_profile.write'));
create policy search_profile_property_decisions_delete on public.search_profile_property_decisions for delete using(app_private.has_permission('search_profile.write'));
create trigger search_profile_property_decisions_set_update_metadata before update on public.search_profile_property_decisions for each row execute function app_private.set_business_update_metadata();
create trigger search_profile_property_decisions_audit after insert or update or delete on public.search_profile_property_decisions for each row execute function app_private.audit_row_change('SEARCH_PROFILE_MATCH','id');
grant select,insert,update,delete on public.search_profile_property_decisions to authenticated;

create or replace function public.match_properties_for_search_profile(p_search_profile_id uuid,p_limit integer default 50)
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
security invoker
set search_path=public,pg_temp
as $$
declare
 sp public.search_profiles%rowtype;
 r record;
 v_score numeric;
 v_reasons text[];
 v_price numeric;
 v_location_match boolean;
 v_feature_total integer;
 v_feature_matches integer;
begin
 if not app_private.has_permission('search_profile.read') then raise exception 'SEARCH_PROFILE_READ_REQUIRED' using errcode='42501'; end if;
 select * into sp from public.search_profiles where id=p_search_profile_id and archived_at is null;
 if sp.id is null then raise exception 'SEARCH_PROFILE_NOT_FOUND' using errcode='P0002'; end if;

 for r in
  select p.*,pa.city as addr_city,pa.postal_code,pa.district,
         d.status as decision_status,
         coalesce(array_agg(distinct lower(coalesce(pf.label,pf.feature_key))) filter(where pf.id is not null),'{}'::text[]) as feature_labels
  from public.properties p
  left join public.property_addresses pa on pa.property_id=p.id
  left join public.property_features pf on pf.property_id=p.id
  left join public.search_profile_property_decisions d on d.search_profile_id=sp.id and d.property_id=p.id
  where p.status in ('PREPARATION','MARKETING')
    and p.transaction_type=case when sp.transaction_type='BUY' then 'SALE' else 'RENT' end
    and (cardinality(sp.property_types)=0 or p.property_type=any(sp.property_types))
  group by p.id,pa.city,pa.postal_code,pa.district,d.status
 loop
  v_score:=100; v_reasons:='{}'::text[];
  v_price:=case when sp.transaction_type='BUY' then r.purchase_price else r.rent_cold end;

  if cardinality(sp.property_types)>0 then v_reasons:=array_append(v_reasons,'Immobilientyp passt'); end if;

  if sp.min_price is not null or sp.max_price is not null then
   if v_price is null then v_score:=v_score-20; v_reasons:=array_append(v_reasons,'Preis am Objekt fehlt');
   elsif (sp.min_price is not null and v_price<sp.min_price) or (sp.max_price is not null and v_price>sp.max_price) then v_score:=v_score-20; v_reasons:=array_append(v_reasons,'Preis außerhalb des Suchbereichs');
   else v_reasons:=array_append(v_reasons,'Preis passt'); end if;
  end if;

  if sp.min_living_area is not null or sp.max_living_area is not null then
   if r.living_area_sqm is null then v_score:=v_score-15; v_reasons:=array_append(v_reasons,'Wohnfläche am Objekt fehlt');
   elsif (sp.min_living_area is not null and r.living_area_sqm<sp.min_living_area) or (sp.max_living_area is not null and r.living_area_sqm>sp.max_living_area) then v_score:=v_score-15; v_reasons:=array_append(v_reasons,'Wohnfläche außerhalb des Suchbereichs');
   else v_reasons:=array_append(v_reasons,'Wohnfläche passt'); end if;
  end if;

  if sp.min_plot_area is not null then
   if r.plot_area_sqm is null or r.plot_area_sqm<sp.min_plot_area then v_score:=v_score-10; v_reasons:=array_append(v_reasons,'Grundstück kleiner als gewünscht'); else v_reasons:=array_append(v_reasons,'Grundstück passt'); end if;
  end if;

  if sp.min_rooms is not null then
   if r.rooms is null or r.rooms<sp.min_rooms then v_score:=v_score-10; v_reasons:=array_append(v_reasons,'Zu wenige Zimmer'); else v_reasons:=array_append(v_reasons,'Zimmerzahl passt'); end if;
  end if;

  if sp.min_construction_year is not null then
   if r.year_built is null or r.year_built<sp.min_construction_year then v_score:=v_score-5; v_reasons:=array_append(v_reasons,'Baujahr älter als gewünscht'); else v_reasons:=array_append(v_reasons,'Baujahr passt'); end if;
  end if;

  if exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=sp.id) then
   select exists(
    select 1 from public.search_profile_locations sl
    where sl.search_profile_id=sp.id and (
      (sl.postal_code is not null and sl.postal_code=r.postal_code) or
      lower(sl.city)=lower(coalesce(r.addr_city,'')) or
      (sl.district is not null and lower(sl.district)=lower(coalesce(r.district,'')))
    )
   ) into v_location_match;
   if v_location_match then v_reasons:=array_append(v_reasons,'Suchort passt'); else v_score:=v_score-25; v_reasons:=array_append(v_reasons,'Außerhalb der hinterlegten Suchorte'); end if;
  end if;

  v_feature_total:=cardinality(sp.desired_features);
  if v_feature_total>0 then
   select count(*) into v_feature_matches
   from unnest(sp.desired_features) f
   where exists(select 1 from unnest(r.feature_labels) pl where pl ilike '%'||lower(f)||'%');
   if v_feature_matches=v_feature_total then v_reasons:=array_append(v_reasons,'Gewünschte Merkmale passen');
   else v_score:=v_score-(10*(v_feature_total-v_feature_matches)::numeric/v_feature_total); v_reasons:=array_append(v_reasons,format('%s von %s gewünschten Merkmalen vorhanden',v_feature_matches,v_feature_total)); end if;
  end if;

  property_id:=r.id; property_number:=r.property_number; title:=r.internal_title; city:=r.addr_city;
  purchase_or_rent:=v_price; living_area_sqm:=r.living_area_sqm; plot_area_sqm:=r.plot_area_sqm; rooms:=r.rooms;
  score:=greatest(0,round(v_score,2)); reasons:=v_reasons; decision_status:=r.decision_status;
  return next;
 end loop;
end;
$$;
revoke all on function public.match_properties_for_search_profile(uuid,integer) from public,anon;
grant execute on function public.match_properties_for_search_profile(uuid,integer) to authenticated;

create or replace function public.crm_global_search(p_query text,p_include_archived boolean default false)
returns table(entity_type text,entity_id uuid,reference text,title text,subtitle text,status text,updated_at timestamptz,archived boolean,version bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
 with term as(select '%'||trim(coalesce(p_query,''))||'%' pattern)
 select 'CONTACT',c.id,c.contact_number,trim(c.first_name||' '||c.last_name),coalesce(c.email,c.mobile,c.phone,'—'),c.status,c.updated_at,(c.archived_at is not null),c.version from public.contacts c,term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or c.archived_at is null) and (c.contact_number ilike t.pattern or trim(c.first_name||' '||c.last_name) ilike t.pattern or trim(c.last_name||' '||c.first_name) ilike t.pattern or c.first_name ilike t.pattern or c.last_name ilike t.pattern or coalesce(c.email,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or exists(select 1 from public.contact_addresses a where a.contact_id=c.id and (p_include_archived or a.archived_at is null) and (trim(a.street||' '||coalesce(a.house_number,'')) ilike t.pattern or trim(a.postal_code||' '||a.city) ilike t.pattern or a.street ilike t.pattern or a.postal_code ilike t.pattern or a.city ilike t.pattern)))
 union all
 select 'ORGANIZATION',o.id,o.organization_number,o.name,coalesce(nullif(trim(coalesce(o.legal_form,'')||case when o.city is not null then ' · '||o.city else '' end),''),coalesce(o.email,'—')),o.status,o.updated_at,(o.archived_at is not null),o.version from public.organizations o,term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or o.archived_at is null) and (o.organization_number ilike t.pattern or o.name ilike t.pattern or coalesce(o.email,'') ilike t.pattern or coalesce(o.phone,'') ilike t.pattern or coalesce(o.city,'') ilike t.pattern)
 union all
 select 'TASK',ta.id,ta.task_number,ta.title,coalesce(ta.description,'—'),ta.status,ta.updated_at,(ta.archived_at is not null),ta.version from public.tasks ta,term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or ta.archived_at is null) and (ta.task_number ilike t.pattern or ta.title ilike t.pattern or coalesce(ta.description,'') ilike t.pattern)
 union all
 select 'PROPERTY',p.id,p.property_number,p.internal_title,coalesce((select trim(pa.postal_code||' '||pa.city||case when pa.district is not null then ' · '||pa.district else '' end) from public.property_addresses pa where pa.property_id=p.id),case when p.transaction_type='SALE' then 'Verkauf' else 'Vermietung' end),p.status,p.updated_at,(p.status='ARCHIVED'),p.version from public.properties p,term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or p.status<>'ARCHIVED') and (p.property_number ilike t.pattern or p.internal_title ilike t.pattern or p.property_type ilike t.pattern or p.status ilike t.pattern or exists(select 1 from public.property_addresses pa where pa.property_id=p.id and (trim(pa.street||' '||pa.house_number) ilike t.pattern or trim(pa.postal_code||' '||pa.city) ilike t.pattern or coalesce(pa.district,'') ilike t.pattern)))
 union all
 select 'LEAD',l.id,l.lead_number,trim(c.first_name||' '||c.last_name),coalesce(nullif(trim(coalesce(l.property_postal_code,'')||' '||coalesce(l.property_city,'')),''),s.label,'Verkäufer-Lead'),l.status,l.updated_at,(l.archived_at is not null),l.version from public.leads l join public.contacts c on c.id=l.contact_id left join public.lead_sources s on s.id=l.source_id cross join term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or l.archived_at is null) and (l.lead_number ilike t.pattern or trim(c.first_name||' '||c.last_name) ilike t.pattern or coalesce(c.email,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or coalesce(l.property_street,'') ilike t.pattern or coalesce(l.property_house_number,'') ilike t.pattern or coalesce(l.property_postal_code,'') ilike t.pattern or coalesce(l.property_city,'') ilike t.pattern)
 union all
 select 'SEARCH_PROFILE',sp.id,sp.search_profile_number,sp.title,trim(c.first_name||' '||c.last_name)||' · '||case when sp.transaction_type='BUY' then 'Kauf' else 'Miete' end,sp.status,sp.updated_at,(sp.archived_at is not null),sp.version from public.search_profiles sp join public.contacts c on c.id=sp.contact_id cross join term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or sp.archived_at is null) and (sp.search_profile_number ilike t.pattern or sp.title ilike t.pattern or trim(c.first_name||' '||c.last_name) ilike t.pattern or coalesce(c.email,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=sp.id and (coalesce(sl.postal_code,'') ilike t.pattern or sl.city ilike t.pattern or coalesce(sl.district,'') ilike t.pattern)))
 union all
 select 'INQUIRY',i.id,i.inquiry_number,trim(c.first_name||' '||c.last_name),coalesce(p.property_number,sp.search_profile_number,i.source_label,i.channel),i.status,i.updated_at,(i.archived_at is not null),i.version from public.inquiries i join public.contacts c on c.id=i.contact_id left join public.properties p on p.id=i.property_id left join public.search_profiles sp on sp.id=i.search_profile_id cross join term t where trim(coalesce(p_query,''))<>'' and (p_include_archived or i.archived_at is null) and (i.inquiry_number ilike t.pattern or trim(c.first_name||' '||c.last_name) ilike t.pattern or coalesce(c.email,'') ilike t.pattern or coalesce(c.phone,'') ilike t.pattern or coalesce(c.mobile,'') ilike t.pattern or coalesce(p.property_number,'') ilike t.pattern or coalesce(sp.search_profile_number,'') ilike t.pattern or coalesce(i.message,'') ilike t.pattern)
 order by updated_at desc limit 100;
$$;
revoke all on function public.crm_global_search(text,boolean) from public,anon;
grant execute on function public.crm_global_search(text,boolean) to authenticated;
