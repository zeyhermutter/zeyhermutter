-- Drei neue Seiten im Website-CMS.
--
-- Alle drei gehoeren ins CMS und nicht fest in den Code, aber aus drei
-- verschiedenen Gruenden:
--
--   ABOUT         Die Angaben ueber das Unternehmen kenne ich nicht. Namen,
--                 Werdegang, Qualifikationen, Jahreszahlen -- nichts davon
--                 darf erfunden werden, und nichts davon gehoert in ein
--                 Programmbuendel, in dem es niemand aendern kann.
--
--   WITHDRAWAL    Eine Widerrufsbelehrung ist ein Rechtstext. Die Software
--                 erzeugt keine Belehrungen. Die Seite ist vorbereitet, der
--                 Text kommt aus der Rechtsberatung und wird hier eingesetzt.
--
--   PRIVATE_SALE  Der Text ist Argumentation und laesst sich schreiben, aber
--                 er beschreibt die eigene Leistung -- das will jemand
--                 nachschaerfen koennen, ohne einen Entwickler zu fragen.
--
-- Alle drei starten als DRAFT. Die Seiten sind damit erreichbar und tragen
-- die hinterlegte Vorbelegung; sie behaupten dort nichts, was nicht stimmt.

alter table public.website_pages drop constraint if exists website_pages_key_check;
alter table public.website_pages
  add constraint website_pages_key_check
  check (page_key in ('HOME', 'CONTACT', 'IMPRINT', 'PRIVACY', 'ABOUT', 'WITHDRAWAL', 'PRIVATE_SALE'));

insert into public.website_pages (page_key, path, label, draft_content, status)
values
  ('ABOUT',        '/ueber-uns',              'Über uns',                '{}'::jsonb, 'DRAFT'),
  ('WITHDRAWAL',   '/widerruf',               'Widerrufsbelehrung',      '{}'::jsonb, 'DRAFT'),
  ('PRIVATE_SALE', '/ohne-makler-verkaufen',  'Ohne Makler verkaufen',   '{}'::jsonb, 'DRAFT')
on conflict (page_key) do nothing;

