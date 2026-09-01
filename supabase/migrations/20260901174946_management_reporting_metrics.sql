create or replace function public.crm_management_dashboard_summary(p_scope text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_base jsonb;
  v_user_id uuid := (select auth.uid());
  v_from timestamptz;
  v_to timestamptz;
  v_leads_created bigint := 0;
  v_leads_converted bigint := 0;
  v_viewings_completed bigint := 0;
  v_viewings_with_offer bigint := 0;
  v_marketing_duration_sample bigint := 0;
  v_avg_marketing_days numeric;
  v_lead_sources jsonb := '[]'::jsonb;
begin
  v_base := public.crm_dashboard_summary(p_scope, p_from, p_to);
  v_from := p_from::timestamp at time zone 'Europe/Berlin';
  v_to := (p_to + 1)::timestamp at time zone 'Europe/Berlin';

  select
    count(*)::bigint,
    count(*) filter (where lead.converted_at is not null and lead.converted_at < v_to)::bigint
  into v_leads_created, v_leads_converted
  from public.leads lead
  where lead.archived_at is null
    and lead.created_at >= v_from and lead.created_at < v_to
    and (p_scope = 'company' or lead.primary_responsible_user = v_user_id);

  select
    count(*)::bigint,
    count(*) filter (where exists (
      select 1
      from public.purchase_offers offer
      where offer.viewing_id = viewing.id
        and offer.archived_at is null
        and offer.submitted_at is not null
        and offer.submitted_at >= viewing.starts_at
        and offer.submitted_at < v_to
    ))::bigint
  into v_viewings_completed, v_viewings_with_offer
  from public.viewings viewing
  where viewing.archived_at is null
    and viewing.status = 'COMPLETED'
    and viewing.starts_at >= v_from and viewing.starts_at < v_to
    and (p_scope = 'company' or viewing.primary_responsible_user = v_user_id);

  select
    count(*)::bigint,
    round(avg((closing.notarized_date - first_live.first_live_at::date)::numeric), 1)
  into v_marketing_duration_sample, v_avg_marketing_days
  from public.sale_closings closing
  left join lateral (
    select min(placement.live_at) as first_live_at
    from public.property_marketing_placements placement
    where placement.property_id = closing.property_id
      and placement.live_at is not null
  ) first_live on true
  where closing.archived_at is null
    and closing.status <> 'CANCELLED'
    and closing.notarized_date between p_from and p_to
    and first_live.first_live_at is not null
    and first_live.first_live_at::date <= closing.notarized_date
    and (p_scope = 'company' or closing.primary_responsible_user = v_user_id);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source_key', source_row.source_key,
      'source_label', source_row.source_label,
      'leads', source_row.leads,
      'converted', source_row.converted,
      'conversion_rate', case when source_row.leads > 0 then round(source_row.converted::numeric * 100 / source_row.leads, 1) else null end
    )
    order by source_row.leads desc, source_row.source_label
  ), '[]'::jsonb)
  into v_lead_sources
  from (
    select
      coalesce(source.key, 'UNASSIGNED') as source_key,
      coalesce(source.label, 'Ohne Quelle') as source_label,
      count(*)::bigint as leads,
      count(*) filter (where lead.converted_at is not null and lead.converted_at < v_to)::bigint as converted
    from public.leads lead
    left join public.lead_sources source on source.id = lead.source_id
    where lead.archived_at is null
      and lead.created_at >= v_from and lead.created_at < v_to
      and (p_scope = 'company' or lead.primary_responsible_user = v_user_id)
    group by coalesce(source.key, 'UNASSIGNED'), coalesce(source.label, 'Ohne Quelle')
  ) source_row;

  return v_base || jsonb_build_object(
    'period', (v_base -> 'period') || jsonb_build_object(
      'leads_converted', v_leads_converted,
      'lead_conversion_rate', case when v_leads_created > 0 then round(v_leads_converted::numeric * 100 / v_leads_created, 1) else null end,
      'viewings_with_offer', v_viewings_with_offer,
      'viewing_offer_rate', case when v_viewings_completed > 0 then round(v_viewings_with_offer::numeric * 100 / v_viewings_completed, 1) else null end,
      'avg_marketing_days', v_avg_marketing_days,
      'marketing_duration_sample', v_marketing_duration_sample
    ),
    'breakdowns', jsonb_build_object('lead_sources', v_lead_sources)
  );
end;
$function$;

revoke all on function public.crm_management_dashboard_summary(text, date, date) from public;
grant execute on function public.crm_management_dashboard_summary(text, date, date) to authenticated, service_role;
