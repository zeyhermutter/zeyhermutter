-- Der Ratgeber: eine Uebersicht und vier Anlassseiten.
--
-- In der Recherche ueber fuenfzehn Maklerseiten waren das die inhaltlich
-- staerksten Seiten ueberhaupt -- und nur vier von fuenfzehn haben sie. Der
-- Grund ist die Ebene: jemand sucht nicht "Immobilienverkauf", sondern
-- "geerbtes Haus verkaufen drei Erben".
--
-- Diese vier Themen sind zugleich die heikelsten. Erbengemeinschaft,
-- Zugewinnausgleich, Nießbrauch, Spekulationsfrist, Bußgelder nach dem GEG:
-- das ist Rechts- und Steuerberatung, und die leistet diese Software nicht.
--
-- Die Seiten sind deshalb durchgehend aus einer Perspektive geschrieben, die
-- ein Makler auch tatsaechlich einnehmen darf: was der Anlass fuer den
-- VERKAUF bedeutet -- welche Unterlagen fehlen, wer zustimmen muss, was den
-- Zeitplan bestimmt. Jede Seite hat einen eigenen Abschnitt, der benennt,
-- wofuer man Notar, Anwalt oder Steuerberater braucht. Der Abschnitt ist
-- nicht das Kleingedruckte, sondern Teil der Aussage.
--
-- Wie die uebrigen Seiten liegen die Texte im CMS und sind aenderbar.

alter table public.website_pages drop constraint if exists website_pages_key_check;
alter table public.website_pages
  add constraint website_pages_key_check
  check (page_key in (
    'HOME', 'CONTACT', 'IMPRINT', 'PRIVACY', 'ABOUT', 'WITHDRAWAL', 'PRIVATE_SALE',
    'GUIDE', 'GUIDE_INHERITANCE', 'GUIDE_DIVORCE', 'GUIDE_AGE', 'GUIDE_ENERGY'
  ));

insert into public.website_pages (page_key, path, label, draft_content, status)
values
  ('GUIDE',             '/ratgeber',                          'Ratgeber · Übersicht',        '{}'::jsonb, 'DRAFT'),
  ('GUIDE_INHERITANCE', '/ratgeber/geerbte-immobilie',        'Ratgeber · Geerbte Immobilie','{}'::jsonb, 'DRAFT'),
  ('GUIDE_DIVORCE',     '/ratgeber/immobilie-bei-trennung',   'Ratgeber · Trennung',         '{}'::jsonb, 'DRAFT'),
  ('GUIDE_AGE',         '/ratgeber/immobilie-im-alter',       'Ratgeber · Im Alter',         '{}'::jsonb, 'DRAFT'),
  ('GUIDE_ENERGY',      '/ratgeber/energieausweis',           'Ratgeber · Energieausweis',   '{}'::jsonb, 'DRAFT')
on conflict (page_key) do nothing;

