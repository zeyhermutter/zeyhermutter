-- Umlaute im Vorlagenkatalog nachtragen.
--
-- Die 18 Startzeilen aus 20260907183322 wurden mit ae/oe/ue geschrieben. In
-- der Datenbank ist das folgenlos, auf dem Bildschirm nicht: in der
-- Live-Abnahme stand dort "Teilungserklaerung", "Wohnflaechenberechnung",
-- "Mietvertraege" und "Protokolle der Eigentuemerversammlung". In einer
-- deutschen Anwendung liest sich das wie ein Tippfehler.
--
-- Geaendert wird nur, was noch genau so dasteht wie beim Einspielen. Hat das
-- Buero eine Zeile bereits umbenannt oder den Hinweis angepasst, bleibt sie
-- unberuehrt — der Katalog gehoert dem Buero, nicht der Migration.

update public.document_requirement_templates
   set title = 'Wohnflächenberechnung'
 where template_key = 'LIVING_AREA_CALCULATION' and title = 'Wohnflaechenberechnung';

update public.document_requirement_templates
   set title = 'Teilungserklärung'
 where template_key = 'DECLARATION_OF_DIVISION' and title = 'Teilungserklaerung';

update public.document_requirement_templates
   set title = 'Protokolle der Eigentümerversammlung'
 where template_key = 'MINUTES' and title = 'Protokolle der Eigentuemerversammlung';

update public.document_requirement_templates
   set title = 'Mietverträge'
 where template_key = 'TENANCY_AGREEMENT' and title = 'Mietvertraege';

update public.document_requirement_templates
   set hint = 'Aktueller Auszug, nicht älter als der laufende Vorgang.'
 where template_key = 'LAND_REGISTER' and hint = 'Aktueller Auszug, nicht aelter als der laufende Vorgang.';

update public.document_requirement_templates
   set hint = 'Für Exposé und Besichtigung.'
 where template_key = 'FLOOR_PLAN' and hint = 'Fuer Expose und Besichtigung.';

update public.document_requirement_templates
   set hint = 'Grundlage der Flächenangabe in der Objektakte.'
 where template_key = 'LIVING_AREA_CALCULATION' and hint = 'Grundlage der Flaechenangabe in der Objektakte.';

update public.document_requirement_templates
   set hint = 'Gültig bis eintragen — die Akte warnt beim Ablauf.'
 where template_key = 'ENERGY_CERTIFICATE' and hint = 'Gueltig bis eintragen — die Akte warnt beim Ablauf.';

update public.document_requirement_templates
   set hint = 'Bei Eigentumswohnungen. Sonst "nicht erforderlich".'
 where template_key in ('DECLARATION_OF_DIVISION','WEG')
   and hint = 'Bei Eigentumswohnungen. Sonst "nicht erforderlich".';

update public.document_requirement_templates
   set hint = 'Üblicherweise die letzten drei Jahre.'
 where template_key = 'MINUTES' and hint = 'Ueblicherweise die letzten drei Jahre.';

update public.document_requirement_templates
   set hint = 'Wenn nicht der Eigentümer selbst handelt.'
 where template_key = 'POWER_OF_ATTORNEY' and hint = 'Wenn nicht der Eigentuemer selbst handelt.';

update public.document_requirement_templates
   set hint = 'Für Exposé und Portale.'
 where template_key = 'PHOTOS' and hint = 'Fuer Expose und Portale.';

-- Zeilen, die bereits in eine Akte uebernommen wurden, tragen die Bezeichnung
-- als eigene Kopie. Auch dort wird nur berichtigt, was unveraendert ist.

update public.property_document_requirements
   set title = 'Wohnflächenberechnung'
 where template_key = 'LIVING_AREA_CALCULATION' and title = 'Wohnflaechenberechnung';

update public.property_document_requirements
   set title = 'Teilungserklärung'
 where template_key = 'DECLARATION_OF_DIVISION' and title = 'Teilungserklaerung';

update public.property_document_requirements
   set title = 'Protokolle der Eigentümerversammlung'
 where template_key = 'MINUTES' and title = 'Protokolle der Eigentuemerversammlung';

update public.property_document_requirements
   set title = 'Mietverträge'
 where template_key = 'TENANCY_AGREEMENT' and title = 'Mietvertraege';
