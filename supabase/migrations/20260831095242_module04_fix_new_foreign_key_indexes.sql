create index if not exists activity_events_viewing_idx on public.activity_events(viewing_id) where viewing_id is not null;
create index if not exists purchase_offers_inquiry_idx on public.purchase_offers(inquiry_id) where inquiry_id is not null;
create index if not exists purchase_offers_search_profile_idx on public.purchase_offers(search_profile_id) where search_profile_id is not null;
create index if not exists search_profile_property_decisions_decided_by_idx on public.search_profile_property_decisions(decided_by) where decided_by is not null;
