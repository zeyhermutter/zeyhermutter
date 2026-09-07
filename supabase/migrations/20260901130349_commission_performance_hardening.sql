-- Thema 1 · Provisionen: Performance-Härtung nach Supabase Advisor.
create index if not exists commissions_purchase_offer_idx on public.commissions(purchase_offer_id) where purchase_offer_id is not null;
create index if not exists commissions_responsible_idx on public.commissions(primary_responsible_user);
create index if not exists commissions_created_by_idx on public.commissions(created_by);
create index if not exists commissions_updated_by_idx on public.commissions(updated_by);
create index if not exists commissions_archived_by_idx on public.commissions(archived_by) where archived_by is not null;

drop policy if exists commissions_insert on public.commissions;
create policy commissions_insert on public.commissions for insert to authenticated
with check (app_private.has_permission('commission.write') and created_by=(select auth.uid()));
