-- The admin role is defined as technical full administration. The lead module
-- originally granted its three new sensitive permissions only to the managing
-- director role, leaving the later admin permission set incomplete.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'admin'
  and p.key in ('lead.archive', 'lead.assign', 'lead.convert')
on conflict do nothing;
