alter table public.search_profile_locations alter column city drop not null;
update public.search_profile_locations set radius_km=10 where radius_km is null;
alter table public.search_profile_locations alter column radius_km set default 10;
alter table public.search_profile_locations alter column radius_km set not null;
alter table public.search_profile_locations add column if not exists latitude numeric(9,6);
alter table public.search_profile_locations add column if not exists longitude numeric(9,6);
alter table public.search_profile_locations drop constraint if exists search_profile_locations_valid_location_check;
alter table public.search_profile_locations add constraint search_profile_locations_valid_location_check check (
  (nullif(btrim(coalesce(postal_code,'')),'') is not null or nullif(btrim(coalesce(city,'')),'') is not null)
  and radius_km > 0 and radius_km <= 100
  and (latitude is null or latitude between -90 and 90)
  and (longitude is null or longitude between -180 and 180)
);

create or replace function app_private.prevent_last_search_profile_location_delete()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.search_profiles sp where sp.id=old.search_profile_id)
     and (select count(*) from public.search_profile_locations sl where sl.search_profile_id=old.search_profile_id) <= 1 then
    raise exception 'SEARCH_PROFILE_LOCATION_REQUIRED' using errcode='23514';
  end if;
  return old;
end;$$;
revoke all on function app_private.prevent_last_search_profile_location_delete() from public;
drop trigger if exists search_profile_locations_prevent_last_delete on public.search_profile_locations;
create trigger search_profile_locations_prevent_last_delete before delete on public.search_profile_locations
for each row execute function app_private.prevent_last_search_profile_location_delete();

create or replace function public.create_search_profile(
 p_contact_id uuid,p_title text,p_transaction_type text,p_property_types text[],p_min_price numeric,p_max_price numeric,
 p_min_living_area numeric,p_max_living_area numeric,p_min_plot_area numeric,p_min_rooms numeric,p_min_construction_year integer,
 p_move_in_from date,p_financing_status text,p_desired_features text[],p_internal_notes text,p_primary_responsible_user uuid,
 p_postal_code text,p_city text,p_district text,p_radius_km numeric
) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare v_profile_id uuid; v_radius numeric:=coalesce(p_radius_km,10);
begin
 if not app_private.has_permission('search_profile.write') then raise exception 'missing permission: search_profile.write' using errcode='42501'; end if;
 if p_contact_id is null then raise exception 'contact required' using errcode='22023'; end if;
 if nullif(btrim(p_title),'') is null then raise exception 'title required' using errcode='22023'; end if;
 if nullif(btrim(coalesce(p_postal_code,'')),'') is null and nullif(btrim(coalesce(p_city,'')),'') is null then raise exception 'SEARCH_PROFILE_LOCATION_REQUIRED' using errcode='22023'; end if;
 if v_radius<=0 or v_radius>100 then raise exception 'SEARCH_PROFILE_RADIUS_INVALID' using errcode='22023'; end if;
 insert into public.search_profiles(contact_id,title,status,transaction_type,property_types,min_price,max_price,min_living_area,max_living_area,min_plot_area,min_rooms,min_construction_year,move_in_from,financing_status,desired_features,internal_notes,primary_responsible_user,created_by,updated_by)
 values(p_contact_id,btrim(p_title),'ACTIVE',coalesce(nullif(p_transaction_type,''),'BUY'),coalesce(p_property_types,'{}'),p_min_price,p_max_price,p_min_living_area,p_max_living_area,p_min_plot_area,p_min_rooms,p_min_construction_year,p_move_in_from,nullif(p_financing_status,''),coalesce(p_desired_features,'{}'),nullif(btrim(p_internal_notes),''),coalesce(p_primary_responsible_user,auth.uid()),auth.uid(),auth.uid()) returning id into v_profile_id;
 insert into public.search_profile_locations(search_profile_id,postal_code,city,district,radius_km,created_by)
 values(v_profile_id,nullif(btrim(coalesce(p_postal_code,'')),''),nullif(btrim(coalesce(p_city,'')),''),nullif(btrim(coalesce(p_district,'')),''),v_radius,auth.uid());
 return v_profile_id;
end;$$;

create or replace function public.match_properties_for_search_profile(p_search_profile_id uuid,p_limit integer default 50)
returns table(property_id uuid,property_number text,title text,city text,purchase_or_rent numeric,living_area_sqm numeric,plot_area_sqm numeric,rooms numeric,score numeric,reasons text[],decision_status text)
language plpgsql stable set search_path=public,pg_temp as $$
declare
 sp public.search_profiles%rowtype; r record; v_score numeric; v_reasons text[]; v_price numeric; v_location_reason text;
 v_distance numeric; v_radius numeric; v_feature_total integer; v_feature_matches integer;
begin
 if not app_private.has_permission('search_profile.read') then raise exception 'SEARCH_PROFILE_READ_REQUIRED' using errcode='42501'; end if;
 select * into sp from public.search_profiles where id=p_search_profile_id and archived_at is null;
 if sp.id is null then raise exception 'SEARCH_PROFILE_NOT_FOUND' using errcode='P0002'; end if;
 for r in
  select p.*,pa.city addr_city,pa.postal_code,pa.district,pa.latitude addr_latitude,pa.longitude addr_longitude,d.status decision_status,
   coalesce(array_agg(distinct lower(coalesce(pf.label,pf.feature_key))) filter(where pf.id is not null),'{}'::text[]) feature_labels
  from public.properties p left join public.property_addresses pa on pa.property_id=p.id left join public.property_features pf on pf.property_id=p.id
  left join public.search_profile_property_decisions d on d.search_profile_id=sp.id and d.property_id=p.id
  where p.status in ('PREPARATION','MARKETING','RESERVED') and p.transaction_type=case when sp.transaction_type='BUY' then 'SALE' else 'RENT' end
   and (cardinality(sp.property_types)=0 or p.property_type=any(sp.property_types))
  group by p.id,pa.city,pa.postal_code,pa.district,pa.latitude,pa.longitude,d.status limit greatest(1,least(coalesce(p_limit,50),500))
 loop
  v_score:=100; v_reasons:='{}'; v_price:=case when sp.transaction_type='BUY' then r.purchase_price else r.rent_cold end;
  if cardinality(sp.property_types)>0 then v_reasons:=array_append(v_reasons,'Immobilientyp passt'); end if;
  if sp.min_price is not null or sp.max_price is not null then
   if v_price is null then v_score:=v_score-20;v_reasons:=array_append(v_reasons,'Preis am Objekt fehlt');
   elsif (sp.min_price is not null and v_price<sp.min_price) or (sp.max_price is not null and v_price>sp.max_price) then v_score:=v_score-20;v_reasons:=array_append(v_reasons,'Preis außerhalb des Suchbereichs'); else v_reasons:=array_append(v_reasons,'Preis passt'); end if; end if;
  if sp.min_living_area is not null or sp.max_living_area is not null then
   if r.living_area_sqm is null then v_score:=v_score-15;v_reasons:=array_append(v_reasons,'Wohnfläche am Objekt fehlt');
   elsif (sp.min_living_area is not null and r.living_area_sqm<sp.min_living_area) or (sp.max_living_area is not null and r.living_area_sqm>sp.max_living_area) then v_score:=v_score-15;v_reasons:=array_append(v_reasons,'Wohnfläche außerhalb des Suchbereichs'); else v_reasons:=array_append(v_reasons,'Wohnfläche passt'); end if; end if;
  if sp.min_plot_area is not null then if r.plot_area_sqm is null or r.plot_area_sqm<sp.min_plot_area then v_score:=v_score-10;v_reasons:=array_append(v_reasons,'Grundstück kleiner als gewünscht');else v_reasons:=array_append(v_reasons,'Grundstück passt');end if;end if;
  if sp.min_rooms is not null then if r.rooms is null or r.rooms<sp.min_rooms then v_score:=v_score-10;v_reasons:=array_append(v_reasons,'Zu wenige Zimmer');else v_reasons:=array_append(v_reasons,'Zimmerzahl passt');end if;end if;
  if sp.min_construction_year is not null then if r.year_built is null or r.year_built<sp.min_construction_year then v_score:=v_score-5;v_reasons:=array_append(v_reasons,'Baujahr älter als gewünscht');else v_reasons:=array_append(v_reasons,'Baujahr passt');end if;end if;
  if exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=sp.id) then
   v_location_reason:=null;v_distance:=null;v_radius:=null;
   if exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=sp.id and nullif(btrim(sl.postal_code),'') is not null and sl.postal_code=r.postal_code) then v_location_reason:='PLZ entspricht Suchgebiet';
   elsif exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=sp.id and nullif(btrim(sl.district),'') is not null and lower(sl.district)=lower(coalesce(r.district,'')) and (sl.city is null or lower(sl.city)=lower(coalesce(r.addr_city,'')))) then v_location_reason:='Ortsteil entspricht Suchgebiet';
   elsif exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=sp.id and nullif(btrim(sl.city),'') is not null and lower(sl.city)=lower(coalesce(r.addr_city,''))) then v_location_reason:='Ort entspricht Suchgebiet';
   elsif r.addr_latitude is not null and r.addr_longitude is not null then
    select x.distance_km,x.radius_km into v_distance,v_radius from (
      select 6371*2*asin(sqrt(power(sin(radians((r.addr_latitude-sl.latitude)/2)),2)+cos(radians(sl.latitude))*cos(radians(r.addr_latitude))*power(sin(radians((r.addr_longitude-sl.longitude)/2)),2))) distance_km,sl.radius_km
      from public.search_profile_locations sl where sl.search_profile_id=sp.id and sl.latitude is not null and sl.longitude is not null order by 1 limit 1
    ) x;
    if v_distance is not null and v_distance<=v_radius then v_location_reason:=to_char(v_distance,'FM999990.0')||' km vom Suchort entfernt';
    elsif v_distance is not null then v_score:=v_score-25;v_location_reason:='Außerhalb des Radius von '||to_char(v_radius,'FM999990.##')||' km'; end if;
   end if;
   if v_location_reason is null then v_score:=v_score-25;v_location_reason:='Außerhalb der hinterlegten Suche'; end if;
   v_reasons:=array_append(v_reasons,v_location_reason);
  end if;
  v_feature_total:=cardinality(sp.desired_features);if v_feature_total>0 then select count(*) into v_feature_matches from unnest(sp.desired_features) f where exists(select 1 from unnest(r.feature_labels) pl where pl ilike '%'||lower(f)||'%');if v_feature_matches=v_feature_total then v_reasons:=array_append(v_reasons,'Gewünschte Merkmale passen');else v_score:=v_score-(10*(v_feature_total-v_feature_matches)::numeric/v_feature_total);v_reasons:=array_append(v_reasons,format('%s von %s gewünschten Merkmalen vorhanden',v_feature_matches,v_feature_total));end if;end if;
  property_id:=r.id;property_number:=r.property_number;title:=r.internal_title;city:=r.addr_city;purchase_or_rent:=v_price;living_area_sqm:=r.living_area_sqm;plot_area_sqm:=r.plot_area_sqm;rooms:=r.rooms;score:=greatest(0,round(v_score,2));reasons:=v_reasons;decision_status:=r.decision_status;return next;
 end loop;
end;$$;

create or replace function app_private.validate_inquiry_business_rules()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.status is distinct from new.status and not exists(select 1 from public.inquiry_status_transitions t where t.from_status=old.status and t.to_status=new.status) then raise exception 'INVALID_INQUIRY_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';end if;
 if new.status='LOST' and nullif(trim(coalesce(new.lost_reason,'')),'') is null then raise exception 'INQUIRY_LOST_REASON_REQUIRED' using errcode='22023';end if;
 if new.status<>'LOST' then new.lost_reason:=null;end if;
 if new.status='CLOSED' and new.property_id is null and not (new.channel='WEBSITE' and coalesce(new.source_label,'')='ZeyherMutter Website · Kontakt') then raise exception 'INQUIRY_PROPERTY_REQUIRED_FOR_CLOSE' using errcode='22023';end if;
 if tg_op='UPDATE' and old.status='NEW' and new.status='CONTACTED' and new.answered_at is null then new.answered_at:=now();end if;
 return new;
end;$$;

insert into public.viewing_status_transitions(from_status,to_status,description) values
('COMPLETED','CONFIRMED','Durchgeführt korrigieren: zurück zu bestätigt'),
('COMPLETED','PLANNED','Durchgeführt korrigieren: zurück zu geplant') on conflict do nothing;

alter table public.purchase_offers drop constraint if exists purchase_offers_status_check;
alter table public.purchase_offers add constraint purchase_offers_status_check check(status in ('DRAFT','SUBMITTED','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN','REPLACED'));
alter table public.purchase_offers add column if not exists supersedes_offer_id uuid references public.purchase_offers(id) on delete set null;
alter table public.purchase_offers add column if not exists replaced_by_offer_id uuid references public.purchase_offers(id) on delete set null;
create index if not exists purchase_offers_supersedes_idx on public.purchase_offers(supersedes_offer_id);
create index if not exists purchase_offers_replaced_by_idx on public.purchase_offers(replaced_by_offer_id);
update public.purchase_offers set offer_number='ZM-KA-'||substring(offer_number from 6) where offer_number like 'ZM-O-%';
alter table public.purchase_offers alter column offer_number set default ('ZM-KA-'::text||lpad(nextval('offer_number_seq'::regclass)::text,6,'0'));
insert into public.offer_status_transitions(from_status,to_status,description) values
('SUBMITTED','REPLACED','Durch neueres Angebot ersetzt'),('COUNTERED','REPLACED','Durch neueres Angebot ersetzt') on conflict do nothing;
create unique index if not exists purchase_offers_one_current_active_idx on public.purchase_offers(property_id,contact_id) where archived_at is null and status in ('SUBMITTED','COUNTERED','ACCEPTED');

create or replace function app_private.validate_purchase_offer()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_previous uuid;begin
 if tg_op='UPDATE' and old.status is distinct from new.status and not exists(select 1 from public.offer_status_transitions t where t.from_status=old.status and t.to_status=new.status) then raise exception 'INVALID_OFFER_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';end if;
 if tg_op='UPDATE' and old.status<>'DRAFT' and row(new.amount,new.financing_status,new.valid_until,new.notes,new.property_id,new.contact_id,new.search_profile_id,new.inquiry_id,new.viewing_id) is distinct from row(old.amount,old.financing_status,old.valid_until,old.notes,old.property_id,old.contact_id,old.search_profile_id,old.inquiry_id,old.viewing_id) then raise exception 'SUBMITTED_OFFER_IMMUTABLE_CREATE_FOLLOWUP' using errcode='22023';end if;
 if new.search_profile_id is not null and not exists(select 1 from public.search_profiles sp where sp.id=new.search_profile_id and sp.contact_id=new.contact_id) then raise exception 'OFFER_SEARCH_PROFILE_CONTACT_MISMATCH' using errcode='22023';end if;
 if new.inquiry_id is not null and not exists(select 1 from public.inquiries i where i.id=new.inquiry_id and i.contact_id=new.contact_id) then raise exception 'OFFER_INQUIRY_CONTACT_MISMATCH' using errcode='22023';end if;
 if new.viewing_id is not null and not exists(select 1 from public.viewings v where v.id=new.viewing_id and v.contact_id=new.contact_id and v.property_id=new.property_id) then raise exception 'OFFER_VIEWING_MISMATCH' using errcode='22023';end if;
 if new.status='SUBMITTED' and (tg_op='INSERT' or old.status is distinct from new.status) then
   if exists(select 1 from public.purchase_offers po where po.property_id=new.property_id and po.contact_id=new.contact_id and po.id<>new.id and po.archived_at is null and po.status='ACCEPTED') then raise exception 'ACCEPTED_OFFER_ALREADY_EXISTS' using errcode='22023';end if;
   select po.id into v_previous from public.purchase_offers po where po.property_id=new.property_id and po.contact_id=new.contact_id and po.id<>new.id and po.archived_at is null and po.status in ('SUBMITTED','COUNTERED') order by po.submitted_at desc nulls last,po.created_at desc limit 1;
   if v_previous is not null then
     update public.purchase_offers set status='REPLACED',replaced_by_offer_id=new.id where id=v_previous;
     if new.supersedes_offer_id is null then new.supersedes_offer_id:=v_previous;end if;
   end if;
   if new.submitted_at is null then new.submitted_at:=now();end if;
 end if;
 return new;
end;$$;

create or replace function public.match_search_profiles_for_property(p_property_id uuid,p_limit integer default 50)
returns table(search_profile_id uuid,search_profile_number text,contact_id uuid,contact_name text,profile_title text,transaction_type text,profile_status text,score numeric,reasons text[],decision_status text,locations text[],min_price numeric,max_price numeric)
language sql stable security invoker set search_path=public,pg_temp as $$
 select sp.id,sp.search_profile_number,sp.contact_id,c.first_name||' '||c.last_name,sp.title,sp.transaction_type,sp.status,m.score,m.reasons,m.decision_status,
   coalesce((select array_agg(concat_ws(' ',sl.postal_code,sl.city)||' · '||trim(to_char(sl.radius_km,'FM999990.##'))||' km' order by sl.created_at) from public.search_profile_locations sl where sl.search_profile_id=sp.id),'{}'::text[]),sp.min_price,sp.max_price
 from public.search_profiles sp join public.contacts c on c.id=sp.contact_id
 cross join lateral public.match_properties_for_search_profile(sp.id,500) m
 where sp.archived_at is null and sp.status='ACTIVE' and m.property_id=p_property_id
 order by m.score desc,sp.search_profile_number limit greatest(1,least(coalesce(p_limit,50),200));
$$;
grant execute on function public.match_search_profiles_for_property(uuid,integer) to authenticated;
