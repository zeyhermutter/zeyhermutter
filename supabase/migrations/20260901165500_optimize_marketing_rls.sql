drop policy if exists property_marketing_placements_insert on public.property_marketing_placements;

create policy property_marketing_placements_insert
on public.property_marketing_placements
for insert
to authenticated
with check (
  app_private.has_permission('property.write')
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
