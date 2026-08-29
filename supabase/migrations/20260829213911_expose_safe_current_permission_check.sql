create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select app_private.has_permission(p_permission);
$$;

revoke all on function public.current_user_has_permission(text) from public, anon;
grant execute on function public.current_user_has_permission(text) to authenticated;

comment on function public.current_user_has_permission(text) is 'Safe boolean permission check for the current authenticated user; does not expose role/permission internals or elevate privileges.';
