create index leads_created_by_idx on public.leads(created_by);
create index leads_updated_by_idx on public.leads(updated_by);
create index leads_archived_by_idx on public.leads(archived_by) where archived_by is not null;
create index leads_converted_by_idx on public.leads(converted_by) where converted_by is not null;

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
for insert to authenticated
with check (app_private.has_permission('lead.write') and created_by = (select auth.uid()));

drop policy if exists activity_events_insert_crm on public.activity_events;
create policy activity_events_insert_crm on public.activity_events
for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and (
    (contact_id is not null and app_private.has_permission('contact.write'))
    or (property_id is not null and app_private.has_permission('property.write'))
    or (lead_id is not null and app_private.has_permission('lead.write'))
    or (contact_id is null and property_id is null and lead_id is null)
  )
);

drop policy if exists comments_insert_crm on public.comments;
create policy comments_insert_crm on public.comments
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and (
    (entity_type in ('CONTACT','ORGANIZATION') and app_private.has_permission('contact.write'))
    or (entity_type = 'TASK' and app_private.has_permission('task.write'))
    or (entity_type = 'LEAD' and app_private.has_permission('lead.write'))
  )
);
