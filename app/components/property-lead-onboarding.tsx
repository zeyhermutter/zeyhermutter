import { useEffect } from "react";
import { Link, useLocation } from "react-router";

export function PropertyLeadOnboarding() {
  const location = useLocation();

  useEffect(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="datetime-local"], input[type="time"]'));
    const allowManualEditing = (event: Event) => {
      event.stopImmediatePropagation();
    };

    inputs.forEach((input) => {
      input.title = input.type === "date"
        ? "Datum direkt eingeben oder Kalender-Symbol verwenden"
        : input.type === "time"
          ? "Uhrzeit direkt eingeben oder Auswahl verwenden"
          : "Datum und Uhrzeit direkt eingeben oder Kalender-Symbol verwenden";
      input.addEventListener("click", allowManualEditing, true);
    });

    return () => inputs.forEach((input) => input.removeEventListener("click", allowManualEditing, true));
  }, [location.key, location.pathname]);

  useEffect(() => {
    const leadMatch = location.pathname.match(/^\/leads\/([^/]+)\/?$/);
    if (!leadMatch) return;
    const converted = document.querySelector<HTMLElement>(".lead-conversion-success");
    if (!converted) return;

    const main = document.querySelector<HTMLElement>("main.lead-shell");
    main?.classList.add("lead-is-converted");

    const lockForm = (intent: string) => {
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form")).filter((form) => form.querySelector(`input[name=\"_intent\"][value=\"${intent}\"]`));
      forms.forEach((form) => {
        form.dataset.convertedLeadLocked = "1";
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>("input:not([type=hidden]), select, textarea, button").forEach((control) => {
          control.disabled = true;
        });
      });
      return forms;
    };

    const coreForms = lockForm("core");
    lockForm("status");
    lockForm("assign");
    const taskForms = lockForm("create_task");

    const coreCard = coreForms[0]?.closest<HTMLElement>(".data-card");
    if (coreCard && !coreCard.querySelector(".converted-lead-lock-note")) {
      const note = document.createElement("div");
      note.className = "form-warning converted-lead-lock-note";
      note.innerHTML = "<strong>Lead ist abgeschlossen.</strong><br>Die fachlichen Lead-, Objekt- und Bewertungsdaten sind nach der Immobilienanlage schreibgeschützt. Änderungen erfolgen ab jetzt in der Immobilienakte.";
      coreCard.querySelector(".card-head")?.insertAdjacentElement("afterend", note);
    }

    const propertyLink = converted.querySelector<HTMLAnchorElement>('a[href^="/properties/"]');
    const taskCard = taskForms[0]?.closest<HTMLElement>(".data-card");
    if (taskCard && !taskCard.querySelector(".converted-lead-task-note")) {
      const note = document.createElement("div");
      note.className = "form-warning converted-lead-task-note";
      const href = propertyLink?.getAttribute("href") ?? "";
      note.innerHTML = `<strong>Neue Aufgaben gehören jetzt zur Immobilie.</strong><br>${href ? `<a class="subtle-link" href="${href}">Immobilie öffnen →</a>` : "Bitte die zugehörige Immobilie öffnen."}`;
      taskForms[0]?.insertAdjacentElement("beforebegin", note);
    }

    return () => {
      main?.classList.remove("lead-is-converted");
      document.querySelectorAll<HTMLElement>(".converted-lead-lock-note,.converted-lead-task-note").forEach((node) => node.remove());
    };
  }, [location.key, location.pathname, location.search]);

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
