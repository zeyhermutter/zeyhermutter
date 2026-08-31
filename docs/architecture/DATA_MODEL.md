# ZeyherMutterOS – Datenmodell

Stand: 31.08.2026

## Grundsätze

- CRM-Kontakte sind die einzige Personenidentität; Leads, Eigentümer, Interessenten und Anfragen referenzieren sie.
- Fachliche Nummern werden serverseitig erzeugt; interne UUIDs bleiben technische Schlüssel.
- Veränderliche Aggregate besitzen `version` für Optimistic Concurrency sowie Audit-Metadaten.
- Geschäftsdaten werden archiviert statt gelöscht. Historien- und Versionsdaten sind append-only.
- RLS ist die Sicherheitsgrenze. Browser und Worker verwenden niemals den Service-Role-Key für Benutzerzugriffe.

## Modul 01 – CRM

`contacts` und `contact_addresses` bilden Personen und strukturierte Adressen ab. `organizations` verbindet Firmen über `contact_organization_relationships`; `contact_relationships` modelliert Personenbeziehungen. `tasks`, `activity_events`, Kommentare, Mentions, Notifications und `audit_events` werden von allen Fachmodulen wiederverwendet.

## Modul 02 – Immobilien

`properties` ist der Objekt-Aggregatkopf. Zugeordnet sind `property_addresses`, `property_owners`, `property_features`, `property_energy_data`, `property_marketing_checklist_items`, `property_collaborators` und `property_media`. `documents` referenziert die aktuelle, `document_versions` die unveränderlichen Dateiversionen. Eigentümeranteile, Statusübergänge, Pflichtwerte und Storage-Registrierung werden serverseitig validiert.

## Modul 03 – Verkäufer-Leads

`leads` referenziert immer einen CRM-Kontakt und hält Pipeline-, Bewertungs- und Angebotsdaten. Ein gewonnener Lead wird über `convert_lead_to_property` atomar in `properties`, Adresse und 100%-Eigentümerrelation überführt. `converted_property_id` macht Wiederholungen idempotent.

## Modul 04 – Interessenten

`search_profiles` referenziert einen Kontakt; `search_profile_locations` enthält normalisierte Suchgebiete. `inquiries` kann Kontakt, Immobilie und Suchprofil verbinden. `viewings`, Feedback, `purchase_offers` und `search_profile_property_decisions` halten die operative Historie. Matching in beide Richtungen verwendet dieselbe Datenbanklogik. Die Neuanlage eines Suchprofils aus einer Anfrage erfolgt atomar über `create_search_profile_from_inquiry`.

## Modul 05 – Website und Exposés

`property_publications` ist die interne Arbeitsakte. `property_publication_versions` enthält unveränderliche, freigegebene Snapshots; nur `is_current_public = true` ist anonym lesbar. Öffentliche Anfragen landen im bestehenden Kontakt-/Inquiry-Modell. Exposés referenzieren eine konkrete Publikationsversion und liegen in einem privaten Bucket.

## Storage

Alle Buckets sind privat:

- `zm-private-documents` – interne Dokumentversionen
- `zm-private-exposes` – erzeugte Exposés
- `zm-property-media` – interne Objektmedien
- `zm-public-media` – fachlich freigegebene Website-Medien, ausgeliefert über kurzlebige Signed URLs

Dateiobjekt, Metadatensatz und fachliche Freigabe müssen zusammenpassen; ein Storage-Pfad allein veröffentlicht nichts.
