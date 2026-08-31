# ZeyherMutterOS – Rollen und Berechtigungen

Stand: 31.08.2026

## Modell

Benutzer erhalten Rollen über `user_roles`; Rollen bündeln granulare Einträge aus `permissions` über `role_permissions`. Serverrouten prüfen die relevante Permission, RLS und Datenbanktrigger/RPCs erzwingen sie erneut an der Datengrenze.

## Rollen

- `admin`: technische Volladministration; nach der Review-Migration wieder vollständiger Permission-Satz einschließlich `lead.archive`, `lead.assign` und `lead.convert`.
- `managing_director`: vollständiger operativer Zugriff einschließlich sensibler Freigaben, Audit/Security, Lead-Konvertierung und Benutzerverwaltung; ohne `permission.manage`.
- `agent`: operative Bearbeitung von CRM, Immobilien, Leads, Interessenten, Besichtigungen und Angeboten; keine Publikations-/Archiv-Vollrechte.
- `assistance`: begrenzter operativer Schreibzugriff, insbesondere keine Immobilien-/Lead-Freigaben.
- `marketing`: Website-/Exposé-Bearbeitung und `website.publish`, jedoch kein allgemeiner CRM-Schreibzugriff und kein `property.publish`.

## Sensible Permission-Gruppen

- Archiv: `*.archive`
- Zuständigkeit: `property.assign`, `lead.assign`
- Status/Freigabe: `property.publish`, `website.publish`, `expose.approve`
- Konvertierung: `lead.convert`
- vertrauliche Daten: `document.confidential.read`
- Administration: `user.manage`, `permission.manage`, `settings.manage`
- Nachweise: `audit.read`, `security.read`, `compliance.read`

## API-Rollen

`anon` darf nur aktuelle öffentliche Publikationsversionen lesen und ausdrücklich öffentliche Listing-RPCs ausführen. `authenticated` erhält fachliche CRUD-Rechte, aber kein `TRUNCATE`, `REFERENCES`, `TRIGGER` oder allgemeines Sequenz-Update. Interne RPCs sind für `anon` und `PUBLIC` entzogen.

## Offene fachliche Entscheidung

Publikations- und Exposé-Daten enthalten bereits Ersteller-, Reviewer-, Approver- und Publisher-Metadaten. Noch nicht verbindlich entschieden ist, ob Review/Freigabe zwingend durch eine andere Person als den Bearbeiter erfolgen muss. Vor einer solchen Regel sind Stellvertretung und Betrieb mit zwei Personen verbindlich festzulegen.
