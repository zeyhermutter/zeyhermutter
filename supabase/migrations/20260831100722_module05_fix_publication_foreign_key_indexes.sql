create index if not exists property_publications_created_by_idx on public.property_publications(created_by);
create index if not exists property_publication_versions_approved_by_idx on public.property_publication_versions(approved_by) where approved_by is not null;
create index if not exists property_publication_versions_published_by_idx on public.property_publication_versions(published_by) where published_by is not null;
