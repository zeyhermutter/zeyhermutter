insert into public.permissions (key, description)
values ('reporting.company.read', 'Unternehmensweite Dashboard- und Reporting-Kennzahlen lesen')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.key = 'reporting.company.read'
where role.key in ('admin', 'managing_director')
on conflict do nothing;

create or replace function public.crm_dashboard_summary(
  p_scope text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_from timestamptz;
  v_to timestamptz;
  v_snapshot jsonb;
  v_period jsonb;
  v_pipeline jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_scope not in ('mine', 'company') then
    raise exception 'INVALID_REPORTING_SCOPE' using errcode = '22023';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_REPORTING_PERIOD' using errcode = '22023';
  end if;

  if p_to - p_from > 366 then
    raise exception 'REPORTING_PERIOD_TOO_LARGE' using errcode = '22023';
  end if;

  if p_scope = 'company' and not app_private.has_permission('reporting.company.read') then
    raise exception 'REPORTING_COMPANY_READ_REQUIRED' using errcode = '42501';
  end if;

  v_from := p_from::timestamp at time zone 'Europe/Berlin';
  v_to := (p_to + 1)::timestamp at time zone 'Europe/Berlin';

  select jsonb_build_object(
    'open_tasks', (
      select count(*)
      from public.tasks task
      where task.archived_at is null
        and task.status in ('OPEN', 'IN_PROGRESS')
        and (p_scope = 'company' or task.responsible_user = v_user_id)
    ),
    'overdue_tasks', (
      select count(*)
      from public.tasks task
      where task.archived_at is null
        and task.status in ('OPEN', 'IN_PROGRESS')
        and task.due_at is not null
        and task.due_at < now()
        and (p_scope = 'company' or task.responsible_user = v_user_id)
    ),
    'active_leads', (
      select count(*)
      from public.leads lead
      where lead.archived_at is null
        and lead.status not in ('WON', 'LOST')
        and (p_scope = 'company' or lead.primary_responsible_user = v_user_id)
    ),
    'overdue_lead_followups', (
      select count(*)
      from public.leads lead
      where lead.archived_at is null
        and lead.status not in ('WON', 'LOST')
        and lead.follow_up_at is not null
        and lead.follow_up_at < now()
        and (p_scope = 'company' or lead.primary_responsible_user = v_user_id)
    ),
    'active_properties', (
      select count(*)
      from public.properties property
      where property.archived_at is null
        and property.status not in ('SOLD', 'LOST', 'WITHDRAWN', 'ARCHIVED')
        and (p_scope = 'company' or property.primary_responsible_user = v_user_id)
    ),
    'marketing_properties', (
      select count(*)
      from public.properties property
      where property.archived_at is null
        and property.status in ('MARKETING', 'RESERVED')
        and (p_scope = 'company' or property.primary_responsible_user = v_user_id)
    ),
    'active_search_profiles', (
      select count(*)
      from public.search_profiles profile
      where profile.archived_at is null
        and profile.status = 'ACTIVE'
        and (p_scope = 'company' or profile.primary_responsible_user = v_user_id)
    ),
    'open_inquiries', (
      select count(*)
      from public.inquiries inquiry
      where inquiry.archived_at is null
        and inquiry.status not in ('CLOSED', 'LOST')
        and (p_scope = 'company' or inquiry.primary_responsible_user = v_user_id)
    ),
    'upcoming_viewings', (
      select count(*)
      from public.viewings viewing
      where viewing.archived_at is null
        and viewing.status in ('PLANNED', 'CONFIRMED')
        and viewing.starts_at >= now()
        and (p_scope = 'company' or viewing.primary_responsible_user = v_user_id)
    ),
    'active_offers', (
      select count(*)
      from public.purchase_offers offer
      where offer.archived_at is null
        and offer.status in ('SUBMITTED', 'COUNTERED', 'ACCEPTED')
        and (p_scope = 'company' or offer.primary_responsible_user = v_user_id)
    ),
    'active_closings', (
      select count(*)
      from public.sale_closings closing
      where closing.archived_at is null
        and closing.status not in ('COMPLETED', 'CANCELLED')
        and (p_scope = 'company' or closing.primary_responsible_user = v_user_id)
    ),
    'due_commissions', (
      select count(*)
      from public.commissions commission
      where commission.archived_at is null
        and commission.status in ('DUE', 'INVOICED', 'PARTIALLY_PAID')
        and (p_scope = 'company' or commission.primary_responsible_user = v_user_id)
    ),
    'unpaid_commission_amount', (
      select coalesce(sum(greatest(coalesce(commission.actual_amount, commission.expected_amount, 0) - coalesce(commission.paid_amount, 0), 0)), 0)
      from public.commissions commission
      where commission.archived_at is null
        and commission.status not in ('PAID', 'CANCELLED')
        and (p_scope = 'company' or commission.primary_responsible_user = v_user_id)
    ),
    'live_marketing_channels', (
      select count(*)
      from public.property_marketing_placements placement
      join public.properties property on property.id = placement.property_id
      where placement.status = 'LIVE'
        and property.archived_at is null
        and (p_scope = 'company' or property.primary_responsible_user = v_user_id)
    )
  ) into v_snapshot;

  select jsonb_build_object(
    'leads_created', (
      select count(*)
      from public.leads lead
      where lead.archived_at is null
        and lead.created_at >= v_from and lead.created_at < v_to
        and (p_scope = 'company' or lead.primary_responsible_user = v_user_id)
    ),
    'leads_won', (
      select count(*)
      from public.leads lead
      where lead.archived_at is null
        and lead.status = 'WON'
        and lead.updated_at >= v_from and lead.updated_at < v_to
        and (p_scope = 'company' or lead.primary_responsible_user = v_user_id)
    ),
    'inquiries_received', (
      select count(*)
      from public.inquiries inquiry
      where inquiry.archived_at is null
        and inquiry.received_at >= v_from and inquiry.received_at < v_to
        and (p_scope = 'company' or inquiry.primary_responsible_user = v_user_id)
    ),
    'viewings_completed', (
      select count(*)
      from public.viewings viewing
      where viewing.archived_at is null
        and viewing.status = 'COMPLETED'
        and viewing.starts_at >= v_from and viewing.starts_at < v_to
        and (p_scope = 'company' or viewing.primary_responsible_user = v_user_id)
    ),
    'offers_submitted', (
      select count(*)
      from public.purchase_offers offer
      where offer.archived_at is null
        and offer.submitted_at is not null
        and offer.submitted_at >= v_from and offer.submitted_at < v_to
        and (p_scope = 'company' or offer.primary_responsible_user = v_user_id)
    ),
    'offers_accepted', (
      select count(*)
      from public.purchase_offers offer
      where offer.archived_at is null
        and offer.status = 'ACCEPTED'
        and offer.updated_at >= v_from and offer.updated_at < v_to
        and (p_scope = 'company' or offer.primary_responsible_user = v_user_id)
    ),
    'closings_completed', (
      select count(*)
      from public.sale_closings closing
      where closing.archived_at is null
        and closing.status = 'COMPLETED'
        and closing.completed_date between p_from and p_to
        and (p_scope = 'company' or closing.primary_responsible_user = v_user_id)
    ),
    'sale_volume', (
      select coalesce(sum(coalesce(closing.notarial_purchase_price, closing.agreed_purchase_price)), 0)
      from public.sale_closings closing
      where closing.archived_at is null
        and closing.status = 'COMPLETED'
        and closing.completed_date between p_from and p_to
        and (p_scope = 'company' or closing.primary_responsible_user = v_user_id)
    ),
    'commission_expected', (
      select coalesce(sum(coalesce(commission.actual_amount, commission.expected_amount, 0)), 0)
      from public.commissions commission
      where commission.archived_at is null
        and commission.status not in ('DRAFT', 'CANCELLED')
        and commission.created_at >= v_from and commission.created_at < v_to
        and (p_scope = 'company' or commission.primary_responsible_user = v_user_id)
    ),
    'commission_paid', (
      select coalesce(sum(commission.paid_amount), 0)
      from public.commissions commission
      where commission.archived_at is null
        and commission.paid_at between p_from and p_to
        and (p_scope = 'company' or commission.primary_responsible_user = v_user_id)
    )
  ) into v_period;

  select jsonb_build_object(
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object('status', grouped.status, 'count', grouped.count) order by grouped.status)
      from (
        select lead.status, count(*)::bigint as count
        from public.leads lead
        where lead.archived_at is null
          and (p_scope = 'company' or lead.primary_responsible_user = v_user_id)
        group by lead.status
      ) grouped
    ), '[]'::jsonb),
    'properties', coalesce((
      select jsonb_agg(jsonb_build_object('status', grouped.status, 'count', grouped.count) order by grouped.status)
      from (
        select property.status, count(*)::bigint as count
        from public.properties property
        where property.archived_at is null
          and property.status <> 'ARCHIVED'
          and (p_scope = 'company' or property.primary_responsible_user = v_user_id)
        group by property.status
      ) grouped
    ), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('status', grouped.status, 'count', grouped.count) order by grouped.status)
      from (
        select offer.status, count(*)::bigint as count
        from public.purchase_offers offer
        where offer.archived_at is null
          and (p_scope = 'company' or offer.primary_responsible_user = v_user_id)
        group by offer.status
      ) grouped
    ), '[]'::jsonb),
    'closings', coalesce((
      select jsonb_agg(jsonb_build_object('status', grouped.status, 'count', grouped.count) order by grouped.status)
      from (
        select closing.status, count(*)::bigint as count
        from public.sale_closings closing
        where closing.archived_at is null
          and (p_scope = 'company' or closing.primary_responsible_user = v_user_id)
        group by closing.status
      ) grouped
    ), '[]'::jsonb),
    'commissions', coalesce((
      select jsonb_agg(jsonb_build_object('status', grouped.status, 'count', grouped.count) order by grouped.status)
      from (
        select commission.status, count(*)::bigint as count
        from public.commissions commission
        where commission.archived_at is null
          and (p_scope = 'company' or commission.primary_responsible_user = v_user_id)
        group by commission.status
      ) grouped
    ), '[]'::jsonb)
  ) into v_pipeline;

  return jsonb_build_object(
    'scope', p_scope,
    'from', p_from,
    'to', p_to,
    'generated_at', now(),
    'snapshot', v_snapshot,
    'period', v_period,
    'pipeline', v_pipeline
  );
end;
$$;

revoke all on function public.crm_dashboard_summary(text, date, date) from public, anon;
grant execute on function public.crm_dashboard_summary(text, date, date) to authenticated;
