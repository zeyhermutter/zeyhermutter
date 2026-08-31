create or replace function public.consume_public_form_rate_limit(p_fingerprint text,p_limit integer default 3,p_window_minutes integer default 30)
returns boolean
language sql
volatile
security definer
set search_path=app_private,public,pg_temp
as $$
  select app_private.consume_public_form_rate_limit(p_fingerprint,p_limit,p_window_minutes);
$$;
revoke all on function public.consume_public_form_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_public_form_rate_limit(text,integer,integer) to service_role;
