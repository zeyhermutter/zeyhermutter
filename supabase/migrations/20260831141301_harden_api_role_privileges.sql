-- The API roles only need data-manipulation privileges. PostgreSQL's broad
-- defaults also granted TRUNCATE/REFERENCES/TRIGGER and exposed new tables to
-- anon before an explicit public contract was defined.

revoke all privileges on all tables in schema public from anon;
grant select on table public.property_publication_versions to anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke all privileges on all sequences in schema public from anon;
revoke update on all sequences in schema public from authenticated;

-- Keep future migrations least-privileged by default. Public access must be
-- granted explicitly after RLS policies and the intended public projection exist.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke update on sequences from authenticated;

-- These RPCs are authenticated business operations. Their bodies already
-- enforce auth/permissions, but they must not be discoverable or executable by anon.
revoke execute on function public.convert_lead_to_property(uuid,bigint,text) from public, anon;
revoke execute on function public.create_lead_comment(uuid,text,uuid[]) from public, anon;
revoke execute on function public.create_search_profile(uuid,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,integer,date,text,text[],text,uuid,text,text,text,numeric) from public, anon;
revoke execute on function public.match_search_profiles_for_property(uuid,integer) from public, anon;

grant execute on function public.convert_lead_to_property(uuid,bigint,text) to authenticated, service_role;
grant execute on function public.create_lead_comment(uuid,text,uuid[]) to authenticated, service_role;
grant execute on function public.create_search_profile(uuid,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,integer,date,text,text[],text,uuid,text,text,text,numeric) to authenticated, service_role;
grant execute on function public.match_search_profiles_for_property(uuid,integer) to authenticated, service_role;

-- The only anonymous business RPCs are the immutable public listing projections.
grant execute on function public.public_property_listings() to anon, authenticated, service_role;
grant execute on function public.public_property_by_slug(text) to anon, authenticated, service_role;
