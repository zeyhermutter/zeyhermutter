import { Link, useLocation } from "react-router";

export function PropertyLeadOnboarding() {
  const location = useLocation();
  const match = location.pathname.match(/^\/properties\/([^/]+)\/?$/);
  if (!match) return null;
  const params = new URLSearchParams(location.search);
  const leadId = params.get("fromLead");
  if (!leadId || params.get("setup") !== "1") return null;
  const propertyId = match[1];

  return (
    <section className="form-success property-section" aria-label="Nächste Schritte nach Lead-Übernahme">
      <strong>Immobilie wurde aus dem Lead angelegt.</strong>
      <p>Die Stammdaten und der Eigentümer wurden übernommen. Ergänze jetzt die Objektunterlagen und das Bildmaterial, damit die Immobilienakte vollständig wird.</p>
      <div className="inline-actions" style={{ justifyContent: "flex-start" }}>
        <Link className="primary-button link-button" to={`/properties/${propertyId}/documents`}>Dokumente hinzufügen →</Link>
        <Link className="secondary-button link-button" to={`/properties/${propertyId}/media`}>Bilder & Grundrisse hinzufügen →</Link>
        <Link className="subtle-link" to={`/leads/${leadId}`}>Zum ursprünglichen Lead</Link>
      </div>
    </section>
  );
}
