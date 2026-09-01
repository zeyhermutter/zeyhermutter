create table public.property_marketing_placements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  channel_type text not null default 'PORTAL' check (channel_type in ('PORTAL','OWN_WEBSITE','SOCIAL','DIRECT','PRINT','OTHER')),
  channel_name text not null check (length(trim(channel_name)) between 1 and 120),
  delivery_mode text not null default 'MANUAL' check (delivery_mode in ('MANUAL','EXPORT')),
  status text not null default 'PLANNED' check (status in ('PLANNED','READY','LIVE','PAUSED','ERROR','ENDED')),
  publication_version_id uuid references public.property_publication_versions(id) on delete restrict,
  expose_id uuid references public.property_exposes(id) on delete restrict,
  external_listing_id text,
  external_url text check (external_url is null or external_url ~* '^https?://'),
  planned_go_live_at timestamptz,
  live_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  last_verified_at timestamptz,
  last_verified_by uuid references public.profiles(user_id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  version bigint not null default 1 check (version > 0)
);

create index property_marketing_placements_property_idx on public.property_marketing_placements(property_id, status, updated_at desc);
create index property_marketing_placements_publication_version_idx on public.property_marketing_placements(publication_version_id) where publication_version_id is not null;
create index property_marketing_placements_expose_idx on public.property_marketing_placements(expose_id) where expose_id is not null;
create index property_marketing_placements_created_by_idx on public.property_marketing_placements(created_by);
create index property_marketing_placements_updated_by_idx on public.property_marketing_placements(updated_by);
create index property_marketing_placements_verified_by_idx on public.property_marketing_placements(last_verified_by) where last_verified_by is not null;
create unique index property_marketing_active_channel_unique
  on public.property_marketing_placements(property_id, lower(channel_name))
  where status <> 'ENDED';

create or replace function app_private.validate_property_marketing_placement()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  v_property_status text;
  v_publication_property_id uuid;
  v_publication_approved_at timestamptz;
  v_expose_property_id uuid;
  v_expose_status text;
begin
  if tg_op = 'UPDATE' then
    if old.property_id is distinct from new.property_id then
      raise exception 'MARKETING_PROPERTY_IMMUTABLE' using errcode = '22023';
    end if;

    if old.status = 'LIVE' and (
      old.channel_type is distinct from new.channel_type
      or old.channel_name is distinct from new.channel_name
      or old.delivery_mode is distinct from new.delivery_mode
      or old.publication_version_id is distinct from new.publication_version_id
      or old.expose_id is distinct from new.expose_id
    ) then
      raise exception 'PAUSE_MARKETING_BEFORE_SOURCE_CHANGE' using errcode = '22023';
    end if;

    if old.status is distinct from new.status then
      if not (
        (old.status = 'PLANNED' and new.status in ('READY','ENDED'))
        or (old.status = 'READY' and new.status in ('PLANNED','LIVE','ENDED'))
        or (old.status = 'LIVE' and new.status in ('PAUSED','ERROR','ENDED'))
        or (old.status = 'PAUSED' and new.status in ('LIVE','ERROR','ENDED'))
        or (old.status = 'ERROR' and new.status in ('READY','ENDED'))
      ) then
        raise exception 'INVALID_MARKETING_STATUS_TRANSITION' using errcode = '22023';
      end if;

      if new.status in ('LIVE','PAUSED','ERROR','ENDED')
         and not app_private.has_permission('property.publish') then
        raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode = '42501';
      end if;
    end if;
  elsif new.status <> 'PLANNED' then
    raise exception 'MARKETING_PLACEMENT_MUST_START_PLANNED' using errcode = '22023';
  end if;

  select p.status into v_property_status
  from public.properties p
  where p.id = new.property_id and p.archived_at is null;
  if v_property_status is null then
    raise exception 'MARKETING_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if new.publication_version_id is not null then
    select pp.property_id, ppv.approved_at
      into v_publication_property_id, v_publication_approved_at
    from public.property_publication_versions ppv
    join public.property_publications pp on pp.id = ppv.publication_id
    where ppv.id = new.publication_version_id;
    if v_publication_property_id is distinct from new.property_id then
      raise exception 'MARKETING_PUBLICATION_PROPERTY_MISMATCH' using errcode = '23514';
    end if;
    if v_publication_approved_at is null then
      raise exception 'MARKETING_PUBLICATION_NOT_APPROVED' using errcode = '23514';
    end if;
  end if;

  if new.expose_id is not null then
    select e.property_id, e.status
      into v_expose_property_id, v_expose_status
    from public.property_exposes e
    where e.id = new.expose_id;
    if v_expose_property_id is distinct from new.property_id then
      raise exception 'MARKETING_EXPOSE_PROPERTY_MISMATCH' using errcode = '23514';
    end if;
    if v_expose_status <> 'RELEASED' then
      raise exception 'MARKETING_EXPOSE_NOT_RELEASED' using errcode = '23514';
    end if;
  end if;

  if new.status in ('READY','LIVE','PAUSED','ERROR')
     and new.publication_version_id is null
     and new.expose_id is null then
    raise exception 'MARKETING_APPROVED_SOURCE_REQUIRED' using errcode = '23514';
  end if;

  if new.status = 'LIVE' and v_property_status not in ('MARKETING','RESERVED') then
    raise exception 'PROPERTY_NOT_IN_MARKETING' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'LIVE' then
      new.live_at := coalesce(old.live_at, now());
      new.paused_at := null;
      new.ended_at := null;
    elsif new.status in ('PAUSED','ERROR') then
      new.paused_at := now();
    elsif new.status = 'ENDED' then
      new.ended_at := now();
    end if;
  end if;

  if tg_op = 'UPDATE' and old.last_verified_at is distinct from new.last_verified_at then
    new.last_verified_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.last_verified_by := old.last_verified_by;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_property_marketing_placement() from public, anon, authenticated;

create trigger property_marketing_placements_10_validate
before insert or update on public.property_marketing_placements
for each row execute function app_private.validate_property_marketing_placement();

create trigger property_marketing_placements_40_metadata
before update on public.property_marketing_placements
for each row execute function app_private.set_business_update_metadata();

create trigger property_marketing_placements_90_audit
after insert or update or delete on public.property_marketing_placements
for each row execute function app_private.audit_row_change('PROPERTY_MARKETING_PLACEMENT', 'channel_name');

alter table public.property_marketing_placements enable row level security;

create policy property_marketing_placements_select
on public.property_marketing_placements for select to authenticated
using (app_private.has_permission('property.read'));

create policy property_marketing_placements_insert
on public.property_marketing_placements for insert to authenticated
with check (
  app_private.has_permission('property.write')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy property_marketing_placements_update
on public.property_marketing_placements for update to authenticated
using (app_private.has_permission('property.write'))
with check (app_private.has_permission('property.write'));

revoke all privileges on table public.property_marketing_placements from anon, authenticated;
grant select, insert, update on table public.property_marketing_placements to authenticated;
grant select, insert, update, delete on table public.property_marketing_placements to service_role;

comment on table public.property_marketing_placements is 'Operativer Vermarktungs- und Portalstatus je Immobilie. Externe Portalübertragungen werden nicht simuliert; MANUAL/EXPORT dokumentieren den tatsächlichen Übergabeweg und LIVE setzt eine freigegebene Quelle voraus.';
