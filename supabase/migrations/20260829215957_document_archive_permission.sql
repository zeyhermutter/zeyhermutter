insert into public.permissions(key,description)
values('document.archive','Dokumente archivieren')
on conflict(key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('admin','managing_director') and p.key='document.archive'
on conflict do nothing;