create table if not exists public.website_pages (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  path text not null unique,
  label text not null,
  draft_content jsonb not null default '{}'::jsonb,
  seo_title text,
  seo_description text,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','PUBLISHED')),
  candidate_version integer,
  published_version integer,
  has_unpublished_changes boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint website_pages_key_check check (page_key in ('HOME','CONTACT','IMPRINT','PRIVACY')),
  constraint website_pages_path_check check (path ~ '^/.*')
);

create table if not exists public.website_page_versions (
  id uuid primary key default gen_random_uuid(),
  website_page_id uuid not null references public.website_pages(id) on delete restrict,
  page_key text not null,
  version_number integer not null check (version_number > 0),
  content_snapshot jsonb not null,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  is_current_public boolean not null default false,
  unique (website_page_id, version_number)
);

create unique index if not exists website_page_versions_current_public_idx on public.website_page_versions(page_key) where is_current_public;
create index if not exists website_page_versions_page_idx on public.website_page_versions(website_page_id, version_number desc);

create or replace function app_private.website_page_identity_guard() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.page_key is distinct from old.page_key or new.path is distinct from old.path then raise exception 'WEBSITE_PAGE_IDENTITY_IMMUTABLE'; end if;
  return new;
end;
$$;

create or replace function app_private.website_page_version_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.website_page_id is distinct from old.website_page_id or new.page_key is distinct from old.page_key or new.version_number is distinct from old.version_number or new.content_snapshot is distinct from old.content_snapshot or new.seo_title is distinct from old.seo_title or new.seo_description is distinct from old.seo_description or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then raise exception 'WEBSITE_PAGE_VERSION_IMMUTABLE'; end if;
  return new;
end;
$$;

create trigger website_pages_identity_guard before update on public.website_pages for each row execute function app_private.website_page_identity_guard();
create trigger website_pages_set_metadata before update on public.website_pages for each row execute function app_private.set_standard_update_metadata();
create trigger website_pages_audit after insert or update on public.website_pages for each row execute function app_private.audit_row_change('WEBSITE_PAGE','page_key');
create trigger website_page_versions_immutable before update on public.website_page_versions for each row execute function app_private.website_page_version_immutable();

alter table public.website_pages enable row level security;
alter table public.website_page_versions enable row level security;
revoke all on public.website_pages from anon, authenticated;
revoke all on public.website_page_versions from anon, authenticated;
grant select, insert, update on public.website_pages to authenticated;
grant select on public.website_page_versions to anon, authenticated;
grant insert, update on public.website_page_versions to authenticated;

create policy website_pages_select_internal on public.website_pages for select to authenticated using (app_private.has_permission('website.read'));
create policy website_pages_insert_internal on public.website_pages for insert to authenticated with check (app_private.has_permission('website.write') and created_by = (select auth.uid()));
create policy website_pages_update_internal on public.website_pages for update to authenticated using (app_private.has_permission('website.write') or app_private.has_permission('website.publish')) with check (app_private.has_permission('website.write') or app_private.has_permission('website.publish'));
create policy website_page_versions_select_public on public.website_page_versions for select to anon using (is_current_public);
create policy website_page_versions_select_internal on public.website_page_versions for select to authenticated using (app_private.has_permission('website.read'));
create policy website_page_versions_insert_internal on public.website_page_versions for insert to authenticated with check (app_private.has_permission('website.write') and created_by = (select auth.uid()));
create policy website_page_versions_update_publish on public.website_page_versions for update to authenticated using (app_private.has_permission('website.publish')) with check (app_private.has_permission('website.publish'));

create or replace function public.prepare_website_page(p_page_id uuid, p_expected_version bigint) returns integer language plpgsql security invoker set search_path = public, app_private, pg_temp as $$
declare v_page public.website_pages%rowtype; v_next integer;
begin
  if not app_private.has_permission('website.write') then raise exception 'WEBSITE_WRITE_REQUIRED'; end if;
  select * into v_page from public.website_pages where id = p_page_id for update;
  if not found then raise exception 'WEBSITE_PAGE_NOT_FOUND'; end if;
  if v_page.version <> p_expected_version then raise exception 'WEBSITE_PAGE_VERSION_CONFLICT'; end if;
  select coalesce(max(version_number),0)+1 into v_next from public.website_page_versions where website_page_id = p_page_id;
  insert into public.website_page_versions (website_page_id,page_key,version_number,content_snapshot,seo_title,seo_description,created_by) values (v_page.id,v_page.page_key,v_next,v_page.draft_content,v_page.seo_title,v_page.seo_description,auth.uid());
  update public.website_pages set candidate_version = v_next, status = 'READY', has_unpublished_changes = true where id = p_page_id;
  return v_next;
end;
$$;

create or replace function public.publish_website_page(p_page_id uuid, p_expected_version bigint) returns integer language plpgsql security invoker set search_path = public, app_private, pg_temp as $$
declare v_page public.website_pages%rowtype; v_candidate integer;
begin
  if not app_private.has_permission('website.publish') then raise exception 'WEBSITE_PUBLISH_REQUIRED'; end if;
  select * into v_page from public.website_pages where id = p_page_id for update;
  if not found then raise exception 'WEBSITE_PAGE_NOT_FOUND'; end if;
  if v_page.version <> p_expected_version then raise exception 'WEBSITE_PAGE_VERSION_CONFLICT'; end if;
  if v_page.candidate_version is null then raise exception 'WEBSITE_CANDIDATE_REQUIRED'; end if;
  v_candidate := v_page.candidate_version;
  update public.website_page_versions set is_current_public = false where website_page_id = p_page_id and is_current_public;
  update public.website_page_versions set is_current_public = true, published_at = now(), published_by = auth.uid() where website_page_id = p_page_id and version_number = v_candidate;
  if not found then raise exception 'WEBSITE_CANDIDATE_NOT_FOUND'; end if;
  update public.website_pages set published_version = v_candidate, status = 'PUBLISHED', has_unpublished_changes = false where id = p_page_id;
  return v_candidate;
end;
$$;

revoke all on function public.prepare_website_page(uuid,bigint) from public;
revoke all on function public.publish_website_page(uuid,bigint) from public;
grant execute on function public.prepare_website_page(uuid,bigint) to authenticated;
grant execute on function public.publish_website_page(uuid,bigint) to authenticated;

insert into public.website_pages (page_key,path,label,draft_content,seo_title,seo_description,status,candidate_version,published_version,has_unpublished_changes,created_by,updated_by) values
('HOME','/','Startseite','{"hero_eyebrow":"Zeyher & Mutter · Immobilien","hero_title":"Immobilien verkaufen. Persönlich begleitet, professionell vermarktet.","hero_lead":"Wir begleiten Eigentümer vom ersten Gespräch bis zum erfolgreichen Abschluss: mit realistischer Einordnung, klarer Positionierung, hochwertiger Vermarktung und persönlicher Betreuung.","choice_eyebrow":"Zwei Wege zu uns","choice_title":"Sie möchten verkaufen. Wir steigen dort ein, wo Sie gerade stehen.","choice_body":"Für die meisten Eigentümer beginnt die Zusammenarbeit klassisch mit der Immobilienvermittlung. Wenn vor dem Marktstart noch offen ist, ob und welche Vorbereitung sinnvoll ist, ergänzt der Verkaufsstrategie-Check unseren Maklerprozess.","primary_title":"Klassische Maklerleistung aus einer Hand.","primary_body":"Einordnung, Positionierung, Exposé, Vermarktung, Interessentenmanagement, Besichtigungen, Verhandlung und Begleitung bis zum Abschluss.","secondary_title":"Verkaufsstrategie-Check","secondary_body":"Wenn Zustand, Maßnahmen oder Investitionen vor dem Verkauf unklar sind, vergleichen wir Ist-Zustand, gezielte Aufbereitung und größere Maßnahmen.","services_eyebrow":"Unsere Maklerleistung","services_title":"Ein klarer Verkaufsprozess – professionell geführt.","service_1_title":"Bewerten & positionieren","service_1_body":"Immobilie, Zielgruppe und Ausgangslage einordnen und daraus eine schlüssige Vermarktungsstrategie entwickeln.","service_2_title":"Präsentieren & vermarkten","service_2_body":"Unterlagen, Aufbereitung, Darstellung und Vermarktungskanäle zu einem professionellen Marktauftritt zusammenführen.","service_3_title":"Interessenten & Abschluss","service_3_body":"Anfragen qualifizieren, Besichtigungen koordinieren, Verhandlungen begleiten und den Verkaufsprozess strukturiert weiterführen.","check_eyebrow":"Wenn vor dem Verkauf noch Fragen offen sind","check_title":"Erst klären, was die Immobilie braucht. Dann klassisch vermarkten.","check_body":"Der Verkaufsstrategie-Check ist kein Ersatz für unsere Maklerleistung, sondern eine zusätzliche Option davor. Er hilft bei der Entscheidung, ob die Immobilie direkt in den Markt gehen sollte oder ob ausgewählte Maßnahmen sinnvoll erscheinen.","trust_quote":"Eine gute Vermarktung beginnt mit einem klaren Blick auf die Immobilie – und mit einem Makler, der den gesamten Weg weiterführt.","trust_body":"Klassischer Immobilienverkauf als Kernleistung. Verkaufsstrategie-Check als zusätzliche Entscheidungshilfe, wenn vor dem Marktstart noch Klärungsbedarf besteht.","cta_eyebrow":"Wie möchten Sie starten?","cta_title":"Direkt verkaufen oder vorher den Verkaufsweg prüfen."}'::jsonb,'Immobilien verkaufen · Zeyher & Mutter Immobilien','Zeyher & Mutter begleitet Eigentümer beim Immobilienverkauf von der Positionierung über die Vermarktung bis zum Abschluss. Der Verkaufsstrategie-Check ergänzt die Maklerleistung bei offenen Fragen vor dem Marktstart.','PUBLISHED',1,1,false,null,null),
('CONTACT','/kontakt','Kontakt','{"eyebrow":"Kontakt","title":"Wie können wir helfen?","lead":"Schreiben Sie uns zu Verkauf, Vermietung, Bewertung oder Ihrer Immobiliensuche. Ihre Nachricht landet direkt im ZeyherMutter CRM.","personal_eyebrow":"Persönlich","personal_title":"Jochen & Sebastian","personal_body":"Ihre Anfrage wird intern als normaler CRM-Vorgang erfasst und von uns persönlich bearbeitet.","consent_text":"Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage gespeichert und verarbeitet werden. *","submit_label":"Nachricht senden","success_title":"Vielen Dank.","success_text":"Ihre Nachricht wurde übermittelt. Wir melden uns bei Ihnen."}'::jsonb,'Kontakt · ZeyherMutter','Kontaktieren Sie ZeyherMutter für Ihre Immobilienanfrage.','PUBLISHED',1,1,false,null,null),
('IMPRINT','/impressum','Impressum','{"eyebrow":"Rechtliches","title":"Impressum","notice_title":"Finaler Inhalt noch zu hinterlegen.","body":"Die technische Seite ist vorbereitet. Unternehmensform, ladungsfähige Anschrift, Vertretungsberechtigte, Registerangaben, Aufsichtsbehörde und weitere Pflichtangaben werden erst eingetragen, wenn die verbindlichen Daten vorliegen. Es werden keine Angaben erfunden."}'::jsonb,'Impressum · ZeyherMutter',null,'PUBLISHED',1,1,false,null,null),
('PRIVACY','/datenschutz','Datenschutz','{"eyebrow":"Rechtliches","title":"Datenschutz","notice_title":"Finaler Datenschutztext noch zu hinterlegen.","body":"Die Seite ist technisch vorbereitet. Der endgültige Text muss die tatsächlich eingesetzten Dienste, Verantwortlichen, Rechtsgrundlagen, Speicherfristen und Betroffenenrechte korrekt abbilden. Bis diese Angaben verbindlich vorliegen, werden keine juristischen Inhalte erfunden.","note_title":"Kontaktformulare in BETA","note_body":"Formulare sind technisch an das bestehende CRM-Anfragesystem angebunden. Die endgültige Datenschutzerklärung muss diesen Verarbeitungsvorgang vor einer produktiven Veröffentlichung ausdrücklich beschreiben."}'::jsonb,'Datenschutz · ZeyherMutter',null,'PUBLISHED',1,1,false,null,null)
on conflict (page_key) do nothing;

insert into public.website_page_versions (website_page_id,page_key,version_number,content_snapshot,seo_title,seo_description,published_at,is_current_public,created_by,published_by)
select p.id,p.page_key,1,p.draft_content,p.seo_title,p.seo_description,now(),true,null,null from public.website_pages p where p.page_key in ('HOME','CONTACT','IMPRINT','PRIVACY') and not exists (select 1 from public.website_page_versions v where v.website_page_id=p.id and v.version_number=1);
