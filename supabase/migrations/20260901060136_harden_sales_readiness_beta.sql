alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_decision_check;

alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_decision_check
  check (decision in (
    'URGENTLY_RECOMMENDED', 'RECOMMENDED', 'OPTIONAL',
    'NOT_RECOMMENDED', 'NOT_REQUIRED', 'OPEN'
  ));

create or replace function app_private.enforce_lead_sensitive_permissions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
       and current_setting('app.website_seller_check_intake', true) = '1' then
      return new;
    end if;
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
revoke all on function app_private.enforce_lead_sensitive_permissions() from public, anon, authenticated;

create or replace function public.create_public_seller_check_lead(
  p_contact_id uuid,
  p_responsible_user uuid,
  p_submission_key text,
  p_source_url text,
  p_message text,
  p_property_postal_code text,
  p_property_city text,
  p_property_type text,
  p_property_condition text,
  p_desired_sale_horizon text,
  p_consent_text_version text
)
returns table(out_lead_id uuid, out_lead_number text, out_deduplicated boolean)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_source_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_contact_id is null
     or p_responsible_user is null
     or length(trim(coalesce(p_submission_key, ''))) < 16
     or nullif(trim(coalesce(p_message, '')), '') is null
     or nullif(trim(coalesce(p_consent_text_version, '')), '') is null then
    raise exception 'INVALID_SELLER_CHECK_INTAKE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_responsible_user and p.status = 'ACTIVE'
  ) then
    raise exception 'RESPONSIBLE_USER_NOT_ACTIVE' using errcode = '22023';
  end if;
  return query
  select l.id, l.lead_number, true
  from public.leads l where l.website_submission_key = p_submission_key;
  if found then return; end if;
  select id into v_source_id from public.lead_sources where key = 'WEBSITE' and active;
  if v_source_id is null then
    raise exception 'WEBSITE_LEAD_SOURCE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  perform set_config('app.website_seller_check_intake', '1', true);
  return query
  insert into public.leads(
    contact_id, status, source_id, source_detail, primary_responsible_user,
    property_postal_code, property_city, property_type, property_condition,
    desired_sale_horizon, message, consent_given, consent_at,
    consent_text_version, website_submission_key, public_source_url,
    created_by, updated_by
  ) values (
    p_contact_id, 'NEW', v_source_id, 'Verkaufsfertig-Check · Website', p_responsible_user,
    nullif(trim(p_property_postal_code), ''), nullif(trim(p_property_city), ''),
    nullif(trim(p_property_type), ''), nullif(trim(p_property_condition), ''),
    nullif(trim(p_desired_sale_horizon), ''), trim(p_message), true, now(),
    p_consent_text_version, trim(p_submission_key), nullif(trim(p_source_url), ''),
    null, null
  )
  returning id, lead_number, false;
exception
  when unique_violation then
    return query
    select l.id, l.lead_number, true
    from public.leads l where l.website_submission_key = p_submission_key;
end;
$$;
revoke all on function public.create_public_seller_check_lead(uuid, uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_seller_check_lead(uuid, uuid, text, text, text, text, text, text, text, text, text) to service_role;

create table public.lead_sales_readiness_media (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.lead_sales_readiness_checks(id) on delete cascade,
  measure_id uuid references public.lead_sales_readiness_measures(id) on delete set null,
  area_key text not null check (length(trim(area_key)) > 0),
  stage text not null default 'BEFORE' check (stage in ('BEFORE', 'DURING', 'AFTER')),
  storage_bucket text not null check (length(trim(storage_bucket)) > 0),
  storage_object_path text not null check (length(trim(storage_object_path)) > 0),
  internal_note text not null default '',
  marketing_use_approved boolean not null default false,
  marketing_approved_at timestamptz,
  marketing_approved_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  constraint lead_sales_readiness_media_storage_unique unique (storage_bucket, storage_object_path),
  constraint lead_sales_readiness_media_marketing_approval check (
    (marketing_use_approved and marketing_approved_at is not null and marketing_approved_by is not null)
    or (not marketing_use_approved and marketing_approved_at is null and marketing_approved_by is null)
  )
);
create index lead_sales_readiness_media_check_idx on public.lead_sales_readiness_media(check_id, area_key, stage);
create index lead_sales_readiness_media_measure_idx on public.lead_sales_readiness_media(measure_id) where measure_id is not null;
create index lead_sales_readiness_media_created_by_idx on public.lead_sales_readiness_media(created_by);
create index lead_sales_readiness_media_updated_by_idx on public.lead_sales_readiness_media(updated_by);
create trigger lead_sales_readiness_media_10_validate before insert or update or delete on public.lead_sales_readiness_media for each row execute function app_private.validate_sales_readiness_child_write();
create trigger lead_sales_readiness_media_40_metadata before update on public.lead_sales_readiness_media for each row execute function app_private.set_business_update_metadata();
create trigger lead_sales_readiness_media_90_audit after insert or update or delete on public.lead_sales_readiness_media for each row execute function app_private.audit_row_change('LEAD_SALES_READINESS_MEDIA', 'area_key');
alter table public.lead_sales_readiness_media enable row level security;
create policy lead_sales_readiness_media_select on public.lead_sales_readiness_media for select to authenticated using (app_private.has_permission('sales_readiness.read'));
create policy lead_sales_readiness_media_insert on public.lead_sales_readiness_media for insert to authenticated with check (app_private.has_permission('sales_readiness.write') and created_by = auth.uid() and updated_by = auth.uid());
create policy lead_sales_readiness_media_update on public.lead_sales_readiness_media for update to authenticated using (app_private.has_permission('sales_readiness.write')) with check (app_private.has_permission('sales_readiness.write'));
create policy lead_sales_readiness_media_delete on public.lead_sales_readiness_media for delete to authenticated using (app_private.has_permission('sales_readiness.write'));
revoke all privileges on table public.lead_sales_readiness_media from anon, authenticated;
grant select, insert, update, delete on table public.lead_sales_readiness_media to authenticated;
grant select, insert, update, delete on table public.lead_sales_readiness_media to service_role;
comment on table public.lead_sales_readiness_media is 'Metadatenplatz für Vorher-/Währenddessen-/Nachher-Fotos eines Verkaufsfertig-Checks. Storage-Aktivierung erfolgt separat; Marketingfreigabe ist standardmäßig false und muss explizit dokumentiert werden.';
