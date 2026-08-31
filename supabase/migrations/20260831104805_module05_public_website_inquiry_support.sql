alter table public.inquiries
  add column if not exists website_submission_key text,
  add column if not exists consent_given_at timestamptz,
  add column if not exists consent_text_version text,
  add column if not exists public_source_url text;
create unique index if not exists inquiries_website_submission_key_uidx on public.inquiries(website_submission_key) where website_submission_key is not null;

create table if not exists public.public_form_rate_limits (
  fingerprint_hash text not null,
  window_start timestamptz not null,
  submission_count integer not null default 1 check (submission_count > 0),
  updated_at timestamptz not null default now(),
  primary key(fingerprint_hash,window_start)
);
alter table public.public_form_rate_limits enable row level security;
revoke all on public.public_form_rate_limits from anon,authenticated;
grant select,insert,update,delete on public.public_form_rate_limits to service_role;

create or replace function app_private.consume_public_form_rate_limit(p_fingerprint text,p_limit integer default 3,p_window_minutes integer default 30)
returns boolean
language plpgsql
security definer
set search_path=app_private,public,pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if nullif(trim(coalesce(p_fingerprint,'')),'') is null or p_limit<1 or p_window_minutes<1 then return false; end if;
  v_window:=to_timestamp(floor(extract(epoch from now())/(p_window_minutes*60))*(p_window_minutes*60));
  insert into public.public_form_rate_limits(fingerprint_hash,window_start,submission_count,updated_at)
  values(p_fingerprint,v_window,1,now())
  on conflict(fingerprint_hash,window_start) do update
    set submission_count=public.public_form_rate_limits.submission_count+1,updated_at=now()
  returning submission_count into v_count;
  delete from public.public_form_rate_limits where window_start<now()-interval '2 days';
  return v_count<=p_limit;
end;
$$;
revoke all on function app_private.consume_public_form_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function app_private.consume_public_form_rate_limit(text,integer,integer) to service_role;
