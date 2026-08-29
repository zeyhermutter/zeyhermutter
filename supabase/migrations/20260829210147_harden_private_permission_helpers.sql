-- Harden app_private helper execution while allowing RLS policies to call has_permission.

grant usage on schema app_private to authenticated;
revoke usage on schema app_private from anon;

revoke execute on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.has_permission(text) to authenticated;

alter default privileges in schema app_private revoke execute on functions from public;
