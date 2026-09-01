revoke execute on function public.crm_management_dashboard_summary(text, date, date) from anon;
revoke execute on function public.crm_management_dashboard_summary(text, date, date) from public;
grant execute on function public.crm_management_dashboard_summary(text, date, date) to authenticated, service_role;
