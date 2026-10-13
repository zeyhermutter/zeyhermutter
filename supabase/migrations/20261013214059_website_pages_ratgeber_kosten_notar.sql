-- Zwei weitere Ratgeberseiten: "Was kostet mich der Verkauf?" und "Ablauf
-- beim Notar" (13.10.2026). Es sind die beiden Fragen, die Eigentuemer am
-- haeufigsten stellen -- noch vor den vier Anlaessen (Erbe, Trennung, Alter,
-- Energieausweis).
--
-- Wie die uebrigen Ratgeberseiten liegen die Texte im CMS. Die Zeilen werden
-- leer als Entwurf angelegt; bis zur ersten Veroeffentlichung gelten die
-- Vorgaben aus app/lib/website-content.ts.
--
-- Nur erweiternd: die Pruefbedingung bekommt zwei Schluessel dazu, keiner
-- faellt weg.

alter table public.website_pages drop constraint if exists website_pages_key_check;
alter table public.website_pages
  add constraint website_pages_key_check
  check (page_key in (
    'HOME', 'CONTACT', 'IMPRINT', 'PRIVACY', 'ABOUT', 'WITHDRAWAL', 'PRIVATE_SALE',
    'GUIDE', 'GUIDE_INHERITANCE', 'GUIDE_DIVORCE', 'GUIDE_AGE', 'GUIDE_ENERGY',
    'GUIDE_COSTS', 'GUIDE_NOTARY'
  ));

insert into public.website_pages (page_key, path, label, draft_content, status)
values
  ('GUIDE_COSTS',  '/ratgeber/kosten-beim-verkauf', 'Ratgeber · Kosten beim Verkauf', '{}'::jsonb, 'DRAFT'),
  ('GUIDE_NOTARY', '/ratgeber/ablauf-beim-notar',   'Ratgeber · Ablauf beim Notar',   '{}'::jsonb, 'DRAFT')
on conflict (page_key) do nothing;
