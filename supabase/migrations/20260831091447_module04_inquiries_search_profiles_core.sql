create sequence if not exists public.inquiry_number_seq start 1;
create sequence if not exists public.search_profile_number_seq start 1;

insert into public.permissions(key,description) values
 ('inquiry.archive','Anfragen archivieren und wiederherstellen'),
 ('search_profile.read','Suchprofile lesen'),
 ('search_profile.write','Suchprofile bearbeiten'),
 ('search_profile.archive','Suchprofile archivieren und wiederherstellen')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.key in ('inquiry.archive','search_profile.read','search_profile.write','search_profile.archive')
where r.key in ('admin','agent','assistance','managing_director')
on conflict do nothing;

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  search_profile_number text not null unique default ('ZM-S-' || lpad(nextval('public.search_profile_number_seq')::text,6,'0')),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  title text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','CLOSED')),
  transaction_type text not null default 'BUY' check (transaction_type in ('BUY','RENT')),
  property_types text[] not null default '{}',
  min_price numeric(14,2),
  max_price numeric(14,2),
  min_living_area numeric(10,2),
  max_living_area numeric(10,2),
  min_plot_area numeric(10,2),
  min_rooms numeric(5,2),
  min_construction_year integer,
  move_in_from date,
  financing_status text check (financing_status is null or financing_status in ('OPEN','IN_PROGRESS','CONFIRMED','NOT_REQUIRED')),
  desired_features text[] not null default '{}',
  internal_notes text,
  primary_responsible_user uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  archived_at timestamptz,
  archived_by uuid,
  version bigint not null default 1,
  check (min_price is null or min_price >= 0),
  check (max_price is null or max_price >= 0),
  check (min_price is null or max_price is null or min_price <= max_price),
  check (min_living_area is null or min_living_area >= 0),
  check (max_living_area is null or max_living_area >= 0),
  check (min_living_area is null or max_living_area is null or min_living_area <= max_living_area),
  check (min_plot_area is null or min_plot_area >= 0),
  check (min_rooms is null or min_rooms >= 0),
  check (min_construction_year is null or min_construction_year between 1800 and 2200)
);

create table public.search_profile_locations (
  id uuid primary key default gen_random_uuid(),
  search_profile_id uuid not null references public.search_profiles(id) on delete cascade,
  postal_code text,
  city text not null,
  district text,
  radius_km numeric(6,2),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (radius_km is null or radius_km between 0 and 250)
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_number text not null unique default ('ZM-A-' || lpad(nextval('public.inquiry_number_seq')::text,6,'0')),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  property_id uuid references public.properties(id) on delete set null,
  search_profile_id uuid references public.search_profiles(id) on delete set null,
  status text not null default 'NEW' check (status in ('NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED')),
  channel text not null default 'OTHER' check (channel in ('WEBSITE','PORTAL','PHONE','EMAIL','REFERRAL','WALK_IN','OTHER')),
  source_label text,
  message text,
  received_at timestamptz not null default now(),
  primary_responsible_user uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  archived_at timestamptz,
  archived_by uuid,
  version bigint not null default 1
);

create index search_profiles_contact_idx on public.search_profiles(contact_id) where archived_at is null;
create index search_profiles_status_idx on public.search_profiles(status) where archived_at is null;
create index search_profiles_responsible_idx on public.search_profiles(primary_responsible_user) where archived_at is null;
create index search_profiles_property_types_gin on public.search_profiles using gin(property_types);
create index search_profile_locations_profile_idx on public.search_profile_locations(search_profile_id);
create index search_profile_locations_city_idx on public.search_profile_locations(lower(city));
create index search_profile_locations_postal_idx on public.search_profile_locations(postal_code) where postal_code is not null;
create index inquiries_contact_idx on public.inquiries(contact_id) where archived_at is null;
create index inquiries_property_idx on public.inquiries(property_id) where property_id is not null and archived_at is null;
create index inquiries_search_profile_idx on public.inquiries(search_profile_id) where search_profile_id is not null and archived_at is null;
create index inquiries_status_idx on public.inquiries(status) where archived_at is null;
create index inquiries_received_idx on public.inquiries(received_at desc) where archived_at is null;

alter table public.search_profiles enable row level security;
alter table public.search_profile_locations enable row level security;
alter table public.inquiries enable row level security;

create policy search_profiles_select on public.search_profiles for select using (app_private.has_permission('search_profile.read'));
create policy search_profiles_insert on public.search_profiles for insert with check (app_private.has_permission('search_profile.write') and created_by=(select auth.uid()));
create policy search_profiles_update on public.search_profiles for update using (app_private.has_permission('search_profile.write')) with check (app_private.has_permission('search_profile.write'));

create policy search_profile_locations_select on public.search_profile_locations for select using (app_private.has_permission('search_profile.read'));
create policy search_profile_locations_insert on public.search_profile_locations for insert with check (app_private.has_permission('search_profile.write') and created_by=(select auth.uid()));
create policy search_profile_locations_update on public.search_profile_locations for update using (app_private.has_permission('search_profile.write')) with check (app_private.has_permission('search_profile.write'));
create policy search_profile_locations_delete on public.search_profile_locations for delete using (app_private.has_permission('search_profile.write'));

create policy inquiries_select on public.inquiries for select using (app_private.has_permission('inquiry.read'));
create policy inquiries_insert on public.inquiries for insert with check (app_private.has_permission('inquiry.write') and created_by=(select auth.uid()));
create policy inquiries_update on public.inquiries for update using (app_private.has_permission('inquiry.write')) with check (app_private.has_permission('inquiry.write'));

create trigger search_profiles_set_update_metadata before update on public.search_profiles for each row execute function app_private.set_business_update_metadata();
create trigger search_profiles_archive_guard before update on public.search_profiles for each row execute function app_private.enforce_archive_permission('search_profile.archive');
create trigger search_profiles_audit after insert or update or delete on public.search_profiles for each row execute function app_private.audit_row_change('SEARCH_PROFILE','search_profile_number');

create trigger inquiries_set_update_metadata before update on public.inquiries for each row execute function app_private.set_business_update_metadata();
create trigger inquiries_archive_guard before update on public.inquiries for each row execute function app_private.enforce_archive_permission('inquiry.archive');
create trigger inquiries_audit after insert or update or delete on public.inquiries for each row execute function app_private.audit_row_change('INQUIRY','inquiry_number');

alter table public.tasks add column if not exists inquiry_id uuid references public.inquiries(id) on delete set null;
alter table public.tasks add column if not exists search_profile_id uuid references public.search_profiles(id) on delete set null;
create index if not exists tasks_inquiry_idx on public.tasks(inquiry_id) where inquiry_id is not null;
create index if not exists tasks_search_profile_idx on public.tasks(search_profile_id) where search_profile_id is not null;

grant select,insert,update on public.search_profiles to authenticated;
grant select,insert,update,delete on public.search_profile_locations to authenticated;
grant select,insert,update on public.inquiries to authenticated;
grant usage,select on sequence public.search_profile_number_seq to authenticated;
grant usage,select on sequence public.inquiry_number_seq to authenticated;