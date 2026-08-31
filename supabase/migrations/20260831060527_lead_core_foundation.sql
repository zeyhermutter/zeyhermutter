insert into public.permissions(key, description) values
  ('lead.archive','Leads archivieren und wiederherstellen'),
  ('lead.assign','Verantwortlichen Benutzer eines Leads ändern'),
  ('lead.convert','Lead kontrolliert in eine Immobilie überführen')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('lead.archive','lead.assign','lead.convert')
where r.key = 'managing_director'
on conflict do nothing;

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint lead_sources_key_format check (key ~ '^[A-Z][A-Z0-9_]*$')
);

insert into public.lead_sources(key,label,sort_order) values
  ('WEBSITE','Website',10),
  ('REFERRAL','Empfehlung',20),
  ('PHONE','Telefon',30),
  ('EMAIL','E-Mail',40),
  ('CLASSIFIEDS','Kleinanzeigen',50),
  ('PROPERTY_PORTAL','Immobilienportal',60),
  ('SOCIAL_MEDIA','Social Media',70),
  ('NETWORK','Netzwerk',80),
  ('EXISTING','Bestand',90),
  ('OTHER','Sonstige',100)
on conflict (key) do nothing;

alter table public.lead_sources enable row level security;
create policy lead_sources_select on public.lead_sources
for select to authenticated
using (app_private.has_permission('lead.read'));

create sequence app_private.lead_number_seq;
revoke all on sequence app_private.lead_number_seq from public, anon, authenticated;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_number text not null unique,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  status text not null default 'NEW',
  source_id uuid references public.lead_sources(id) on delete restrict,
  source_detail text,
  lost_reason text,
  follow_up_at timestamptz,
  primary_responsible_user uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,

  property_street text,
  property_house_number text,
  property_postal_code text,
  property_city text,
  property_district text,
  property_country text not null default 'DE',
  property_type text,
  year_built integer,
  living_area_sqm numeric(12,2),
  plot_area_sqm numeric(12,2),
  rooms numeric(6,2),
  property_condition text,
  occupancy_status text,
  desired_sale_horizon text,
  price_expectation numeric(14,2),
  message text,

  consent_given boolean not null default false,
  consent_at timestamptz,
  consent_text_version text,

  converted_property_id uuid unique references public.properties(id) on delete restrict,
  converted_at timestamptz,
  converted_by uuid references public.profiles(user_id) on delete restrict,

  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(user_id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.profiles(user_id) on delete restrict,
  version bigint not null default 1,

  constraint leads_status_check check (status in ('NEW','CONTACTED','QUALIFIED','APPOINTMENT','VALUATION','OFFER','WON','LOST','NURTURE')),
  constraint leads_country_check check (property_country ~ '^[A-Z]{2}$'),
  constraint leads_year_built_check check (year_built is null or year_built between 1000 and 2100),
  constraint leads_living_area_check check (living_area_sqm is null or living_area_sqm >= 0),
  constraint leads_plot_area_check check (plot_area_sqm is null or plot_area_sqm >= 0),
  constraint leads_rooms_check check (rooms is null or rooms >= 0),
  constraint leads_price_expectation_check check (price_expectation is null or price_expectation >= 0),
  constraint leads_consent_check check (not consent_given or consent_at is not null),
  constraint leads_conversion_metadata_check check (
    (converted_property_id is null and converted_at is null and converted_by is null)
    or
    (converted_property_id is not null and converted_at is not null and converted_by is not null)
  )
);

create index leads_contact_idx on public.leads(contact_id);
create index leads_status_idx on public.leads(status) where archived_at is null;
create index leads_source_idx on public.leads(source_id) where archived_at is null;
create index leads_responsible_idx on public.leads(primary_responsible_user) where archived_at is null;
create index leads_follow_up_idx on public.leads(follow_up_at) where archived_at is null and follow_up_at is not null;
create index leads_created_at_idx on public.leads(created_at desc);

create table public.lead_status_transitions (
  from_status text not null,
  to_status text not null,
  description text,
  primary key (from_status,to_status),
  constraint lead_status_transitions_from_check check (from_status in ('NEW','CONTACTED','QUALIFIED','APPOINTMENT','VALUATION','OFFER','WON','LOST','NURTURE')),
  constraint lead_status_transitions_to_check check (to_status in ('NEW','CONTACTED','QUALIFIED','APPOINTMENT','VALUATION','OFFER','WON','LOST','NURTURE')),
  constraint lead_status_transitions_no_self check (from_status <> to_status)
);

insert into public.lead_status_transitions(from_status,to_status,description) values
  ('NEW','CONTACTED','Erstkontakt hergestellt'),
  ('NEW','LOST','Lead verloren'),
  ('NEW','NURTURE','Spätere Wiedervorlage'),
  ('CONTACTED','QUALIFIED','Lead qualifiziert'),
  ('CONTACTED','LOST','Lead verloren'),
  ('CONTACTED','NURTURE','Spätere Wiedervorlage'),
  ('QUALIFIED','APPOINTMENT','Termin vereinbart'),
  ('QUALIFIED','VALUATION','Direkt in Bewertung'),
  ('QUALIFIED','LOST','Lead verloren'),
  ('QUALIFIED','NURTURE','Spätere Wiedervorlage'),
  ('APPOINTMENT','VALUATION','Bewertung begonnen'),
  ('APPOINTMENT','LOST','Lead verloren'),
  ('APPOINTMENT','NURTURE','Spätere Wiedervorlage'),
  ('VALUATION','OFFER','Angebot erstellt'),
  ('VALUATION','LOST','Lead verloren'),
  ('VALUATION','NURTURE','Spätere Wiedervorlage'),
  ('OFFER','WON','Auftrag gewonnen'),
  ('OFFER','LOST','Lead verloren'),
  ('OFFER','NURTURE','Spätere Wiedervorlage'),
  ('NURTURE','CONTACTED','Kontakt wieder aufgenommen'),
  ('NURTURE','QUALIFIED','Reaktivierter Lead qualifiziert'),
  ('NURTURE','LOST','Lead endgültig verloren'),
  ('LOST','NURTURE','Verlorenen Lead in Pflege übernehmen'),
  ('LOST','CONTACTED','Verlorenen Lead reaktivieren')
on conflict do nothing;

alter table public.lead_status_transitions enable row level security;
create policy lead_status_transitions_select on public.lead_status_transitions
for select to authenticated
using (app_private.has_permission('lead.read'));

create or replace function app_private.assign_lead_number()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  new.lead_number := 'ZM-L-' || lpad(nextval('app_private.lead_number_seq')::text,6,'0');
  return new;
end;
$$;
revoke all on function app_private.assign_lead_number() from public, anon, authenticated;

create or replace function app_private.validate_lead_business_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'NEW' then
      raise exception 'new lead must start in NEW';
    end if;
    if new.archived_at is not null or new.archived_by is not null then
      raise exception 'new lead cannot start archived';
    end if;
    if new.converted_property_id is not null or new.converted_at is not null or new.converted_by is not null then
      raise exception 'new lead cannot start converted';
    end if;
  else
    if old.lead_number is distinct from new.lead_number then
      raise exception 'lead number is system managed and immutable';
    end if;
    if old.status is distinct from new.status and not exists (
      select 1 from public.lead_status_transitions t
      where t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'invalid lead status transition: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'LOST' and nullif(trim(coalesce(new.lost_reason,'')),'') is null then
    raise exception 'lost reason required for LOST lead';
  end if;
  if new.consent_given and new.consent_at is null then
    raise exception 'consent timestamp required when consent is given';
  end if;
  return new;
end;
$$;

create or replace function app_private.enforce_lead_sensitive_permissions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.primary_responsible_user is distinct from auth.uid()
       and not app_private.has_permission('lead.assign') then
      raise exception 'missing lead.assign permission';
    end if;
    return new;
  end if;

  if old.primary_responsible_user is distinct from new.primary_responsible_user
     and not app_private.has_permission('lead.assign') then
    raise exception 'missing lead.assign permission';
  end if;

  if old.archived_at is distinct from new.archived_at
     and not app_private.has_permission('lead.archive') then
    raise exception 'missing lead.archive permission';
  end if;

  if old.converted_property_id is distinct from new.converted_property_id
     or old.converted_at is distinct from new.converted_at
     or old.converted_by is distinct from new.converted_by then
    if current_setting('app.lead_conversion', true) <> '1'
       or not app_private.has_permission('lead.convert') then
      raise exception 'lead conversion metadata is managed by the conversion workflow';
    end if;
  end if;

  return new;
end;
$$;

create trigger leads_10_assign_number
before insert on public.leads
for each row execute function app_private.assign_lead_number();
create trigger leads_20_validate_business
before insert or update on public.leads
for each row execute function app_private.validate_lead_business_rules();
create trigger leads_30_sensitive_permissions
before insert or update on public.leads
for each row execute function app_private.enforce_lead_sensitive_permissions();
create trigger leads_40_set_metadata
before update on public.leads
for each row execute function app_private.set_business_update_metadata();
create trigger leads_90_audit
after insert or update or delete on public.leads
for each row execute function app_private.audit_row_change('LEAD','lead_number');

alter table public.leads enable row level security;
create policy leads_select on public.leads
for select to authenticated
using (app_private.has_permission('lead.read'));
create policy leads_insert on public.leads
for insert to authenticated
with check (app_private.has_permission('lead.write') and created_by = auth.uid());
create policy leads_update on public.leads
for update to authenticated
using (app_private.has_permission('lead.write'))
with check (app_private.has_permission('lead.write'));

alter table public.tasks add column lead_id uuid references public.leads(id) on delete restrict;
create index tasks_lead_idx on public.tasks(lead_id) where lead_id is not null;

alter table public.activity_events
  add constraint activity_events_lead_fk foreign key (lead_id) references public.leads(id) on delete restrict;
create index activity_events_lead_idx on public.activity_events(lead_id) where lead_id is not null;

drop policy if exists activity_events_insert_crm on public.activity_events;
create policy activity_events_insert_crm on public.activity_events
for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and (
    (contact_id is not null and app_private.has_permission('contact.write'))
    or (property_id is not null and app_private.has_permission('property.write'))
    or (lead_id is not null and app_private.has_permission('lead.write'))
    or (contact_id is null and property_id is null and lead_id is null)
  )
);

drop policy if exists activity_events_select_crm on public.activity_events;
create policy activity_events_select_crm on public.activity_events
for select to authenticated
using (
  (contact_id is not null and app_private.has_permission('contact.read'))
  or (property_id is not null and app_private.has_permission('property.read'))
  or (lead_id is not null and app_private.has_permission('lead.read'))
  or (contact_id is null and property_id is null and lead_id is null and app_private.has_permission('audit.read'))
);

drop policy if exists comments_insert_crm on public.comments;
create policy comments_insert_crm on public.comments
for insert to authenticated
with check (
  author_user_id = auth.uid()
  and (
    (entity_type in ('CONTACT','ORGANIZATION') and app_private.has_permission('contact.write'))
    or (entity_type = 'TASK' and app_private.has_permission('task.write'))
    or (entity_type = 'LEAD' and app_private.has_permission('lead.write'))
  )
);

drop policy if exists comments_select_crm on public.comments;
create policy comments_select_crm on public.comments
for select to authenticated
using (
  (entity_type in ('CONTACT','ORGANIZATION') and app_private.has_permission('contact.read'))
  or (entity_type = 'TASK' and app_private.has_permission('task.read'))
  or (entity_type = 'LEAD' and app_private.has_permission('lead.read'))
);

create or replace function public.create_lead_comment(
  p_lead_id uuid,
  p_body text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_comment_id uuid;
  v_mentioned uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.has_permission('lead.write') then
    raise exception 'LEAD_WRITE_REQUIRED' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then
    raise exception 'COMMENT_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.leads l where l.id = p_lead_id and l.archived_at is null
  ) then
    raise exception 'LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.comments(entity_type, entity_id, body, author_user_id)
  values ('LEAD', p_lead_id, trim(p_body), v_user)
  returning id into v_comment_id;

  for v_mentioned in
    select distinct x
    from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) x
    where x <> v_user
  loop
    insert into public.comment_mentions(comment_id, mentioned_user_id)
    values (v_comment_id, v_mentioned)
    on conflict do nothing;
  end loop;

  return v_comment_id;
end;
$$;
grant execute on function public.create_lead_comment(uuid,text,uuid[]) to authenticated;
