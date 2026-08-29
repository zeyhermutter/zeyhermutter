-- Supabase automatic-RLS helper exists in public schema when automatic RLS is enabled.
-- It must not be callable through the Data API by anon/authenticated users.

revoke execute on function public.rls_auto_enable() from anon, authenticated;
