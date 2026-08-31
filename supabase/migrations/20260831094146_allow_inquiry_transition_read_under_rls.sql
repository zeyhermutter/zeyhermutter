drop policy if exists inquiry_status_transitions_select on public.inquiry_status_transitions;
create policy inquiry_status_transitions_select on public.inquiry_status_transitions for select using (app_private.has_permission('inquiry.read'));
