import { useEffect } from "react";
import { Link, useLocation } from "react-router";

const QUALIFIED_STATUS_LABELS = new Set(["Qualifiziert", "Termin", "Bewertung", "Angebot", "Gewonnen"]);
const QUALIFIED_TARGETS = new Set(["QUALIFIED", "APPOINTMENT", "VALUATION", "OFFER", "WON"]);

function positiveNumber(control: HTMLInputElement | null) {
  if (!control) return false;
  const normalized = control.value.trim().replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0;
}

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

    const timer = window.setTimeout(() => {
      const converted = document.querySelector<HTMLElement>(".lead-conversion-success");
      const main = document.querySelector<HTMLElement>("main.lead-shell");

      if (converted) {
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
        return;
      }

      const coreForm = Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => form.querySelector('input[name="_intent"][value="core"]'));
      if (!coreForm) return;

      const source = coreForm.querySelector<HTMLSelectElement>('select[name="source_id"]');
      const propertyType = coreForm.querySelector<HTMLSelectElement>('select[name="property_type"]');
      const street = coreForm.querySelector<HTMLInputElement>('input[name="property_street"]');
      const houseNumber = coreForm.querySelector<HTMLInputElement>('input[name="property_house_number"]');
      const postalCode = coreForm.querySelector<HTMLInputElement>('input[name="property_postal_code"]');
      const city = coreForm.querySelector<HTMLInputElement>('input[name="property_city"]');
      const occupancy = coreForm.querySelector<HTMLSelectElement>('select[name="occupancy_status"]');
      const horizon = coreForm.querySelector<HTMLInputElement>('input[name="desired_sale_horizon"]');
      const livingArea = coreForm.querySelector<HTMLInputElement>('input[name="living_area_sqm"]');
      const plotArea = coreForm.querySelector<HTMLInputElement>('input[name="plot_area_sqm"]');
      const rooms = coreForm.querySelector<HTMLInputElement>('input[name="rooms"]');
      const price = coreForm.querySelector<HTMLInputElement>('input[name="price_expectation"]');
      const marketValue = coreForm.querySelector<HTMLInputElement>('input[name="estimated_market_value"]');

      const controls = [source, propertyType, street, houseNumber, postalCode, city, occupancy, horizon, livingArea, plotArea, rooms, price, marketValue].filter(Boolean) as Array<HTMLInputElement | HTMLSelectElement>;
      controls.forEach((control) => control.closest("label")?.classList.remove("lead-release-blocker"));

      const ids: Array<[HTMLInputElement | HTMLSelectElement | null, string]> = [
        [source, "source"], [propertyType, "property-type"], [street, "property-street"], [houseNumber, "property-house-number"],
        [postalCode, "property-postal-code"], [city, "property-city"], [occupancy, "occupancy"], [horizon, "sale-horizon"],
        [livingArea, "living-area"], [plotArea, "plot-area"], [rooms, "rooms"], [price, "price"], [marketValue, "market-value"],
      ];
      ids.forEach(([control, key]) => { if (control && !control.id) control.id = `lead-field-${key}`; });

      const statusLabel = document.querySelector<HTMLElement>(".lead-status-pill")?.textContent?.trim() ?? "";
      const savedSource = source?.value.trim() ?? "";
      const coreCard = coreForm.closest<HTMLElement>(".data-card");

      if (QUALIFIED_STATUS_LABELS.has(statusLabel) && !savedSource && source) {
        source.closest("label")?.classList.add("lead-release-blocker");
        if (coreCard && !coreCard.querySelector(".lead-source-required-note")) {
          const note = document.createElement("div");
          note.className = "form-warning lead-source-required-note";
          note.innerHTML = "<strong>Leadquelle fehlt.</strong><br>Ab dem Status „Qualifiziert“ muss die Herkunft des Leads gespeichert sein.";
          coreCard.querySelector(".card-head")?.insertAdjacentElement("afterend", note);
        }
      }

      const statusForms = Array.from(document.querySelectorAll<HTMLFormElement>('form')).filter((form) => form.querySelector('input[name="_intent"][value="status"]'));
      statusForms.forEach((form) => {
        const target = form.querySelector<HTMLInputElement>('input[name="target_status"]')?.value ?? "";
        if (!QUALIFIED_TARGETS.has(target)) return;
        const onSubmit = (event: SubmitEvent) => {
          if (savedSource) return;
          event.preventDefault();
          source?.closest("label")?.classList.add("lead-release-blocker");
          source?.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(() => source?.focus(), 250);
          if (coreCard && !coreCard.querySelector(".lead-source-required-note")) {
            const note = document.createElement("div");
            note.className = "form-warning lead-source-required-note";
            note.innerHTML = "<strong>Leadquelle zuerst speichern.</strong><br>Ab „Qualifiziert“ ist die Leadquelle ein Pflichtfeld.";
            coreCard.querySelector(".card-head")?.insertAdjacentElement("afterend", note);
          }
        };
        form.addEventListener("submit", onSubmit);
        form.dataset.sourceGuardAttached = "1";
        (form as HTMLFormElement & { __sourceGuard?: (event: SubmitEvent) => void }).__sourceGuard = onSubmit;
      });

      const conversionForm = Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => form.querySelector('input[name="_intent"][value="convert"]'));
      if (!conversionForm) return;

      type Requirement = { label: string; focus: HTMLInputElement | HTMLSelectElement | null; mark?: Array<HTMLInputElement | HTMLSelectElement | null> };
      const missing: Requirement[] = [];
      const add = (label: string, focus: HTMLInputElement | HTMLSelectElement | null, mark?: Array<HTMLInputElement | HTMLSelectElement | null>) => missing.push({ label, focus, mark });

      if (!source?.value) add("Leadquelle auswählen und speichern", source);
      if (!propertyType?.value) add("Immobilientyp auswählen und speichern", propertyType);
      if (!street?.value.trim()) add("Straße ergänzen", street);
      if (!houseNumber?.value.trim()) add("Hausnummer ergänzen", houseNumber);
      if (!postalCode?.value.trim()) add("PLZ ergänzen", postalCode);
      if (!city?.value.trim()) add("Ort ergänzen", city);
      if (!occupancy?.value || occupancy.value === "UNKNOWN") add("Belegung festlegen", occupancy);
      if (!horizon?.value.trim()) add("Verkaufshorizont ergänzen", horizon);

      const type = propertyType?.value ?? "";
      if (["APARTMENT", "PENTHOUSE", "MAISONETTE"].includes(type)) {
        if (!positiveNumber(livingArea)) add("Wohnfläche ergänzen", livingArea);
        if (!positiveNumber(rooms)) add("Zimmerzahl ergänzen", rooms);
      } else if (["DETACHED_HOUSE", "SEMI_DETACHED_HOUSE", "TERRACED_HOUSE"].includes(type)) {
        if (!positiveNumber(livingArea)) add("Wohnfläche ergänzen", livingArea);
        if (!positiveNumber(plotArea)) add("Grundstücksfläche ergänzen", plotArea);
        if (!positiveNumber(rooms)) add("Zimmerzahl ergänzen", rooms);
      } else if (type === "APARTMENT_BUILDING") {
        if (!positiveNumber(livingArea)) add("Wohnfläche ergänzen", livingArea);
        if (!positiveNumber(plotArea)) add("Grundstücksfläche ergänzen", plotArea);
      } else if (type === "LAND") {
        if (!positiveNumber(plotArea)) add("Grundstücksfläche ergänzen", plotArea);
      } else if (["COMMERCIAL", "OFFICE", "RETAIL"].includes(type)) {
        if (!positiveNumber(livingArea)) add("Nutz-/Gewerbefläche ergänzen", livingArea);
      } else if (type === "OTHER") {
        if (!positiveNumber(livingArea) && !positiveNumber(plotArea) && !positiveNumber(rooms)) add("Mindestens eine Größenangabe ergänzen", livingArea, [livingArea, plotArea, rooms]);
      }

      if (!positiveNumber(price) && !positiveNumber(marketValue)) {
        add("Preisvorstellung oder geschätzten Marktwert ergänzen", price, [price, marketValue]);
      }

      const livingLabel = livingArea?.closest("label")?.querySelector("span");
      if (livingLabel) livingLabel.textContent = ["COMMERCIAL", "OFFICE", "RETAIL"].includes(type) ? "Nutz-/Gewerbefläche m²" : "Wohnfläche m²";

      missing.forEach((item) => (item.mark ?? [item.focus]).forEach((control) => control?.closest("label")?.classList.add("lead-release-blocker")));

      const existingReadiness = conversionForm.querySelector<HTMLElement>(".lead-conversion-readiness");
      const permissionBlocked = Boolean(existingReadiness?.textContent?.includes("Berechtigung"));
      let readiness = existingReadiness;
      if (!readiness && (missing.length || permissionBlocked)) {
        readiness = document.createElement("div");
        readiness.className = "lead-conversion-readiness";
        readiness.innerHTML = "<strong>Vor der Übernahme noch erforderlich:</strong><ul></ul>";
        conversionForm.querySelector("button[type=submit]")?.insertAdjacentElement("beforebegin", readiness);
      }
      const list = readiness?.querySelector("ul");
      if (list) {
        list.innerHTML = "";
        missing.forEach((item) => {
          const li = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.className = "lead-blocker-link";
          button.textContent = item.label;
          button.addEventListener("click", () => {
            item.focus?.scrollIntoView({ behavior: "smooth", block: "center" });
            window.setTimeout(() => item.focus?.focus(), 250);
          });
          li.appendChild(button);
          list.appendChild(li);
        });
        if (permissionBlocked) {
          const li = document.createElement("li");
          li.textContent = "Berechtigung für Lead-/Immobilienübernahme";
          list.appendChild(li);
        }
      }

      const conversionButton = conversionForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (conversionButton) {
        conversionButton.dataset.serverDisabled = conversionButton.disabled ? "1" : "0";
        conversionButton.disabled = conversionButton.disabled || missing.length > 0;
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.querySelector<HTMLElement>("main.lead-shell")?.classList.remove("lead-is-converted");
      document.querySelectorAll<HTMLElement>(".converted-lead-lock-note,.converted-lead-task-note,.lead-source-required-note").forEach((node) => node.remove());
      document.querySelectorAll<HTMLElement>(".lead-release-blocker").forEach((node) => node.classList.remove("lead-release-blocker"));
      document.querySelectorAll<HTMLFormElement>('form[data-source-guard-attached="1"]').forEach((form) => {
        const guarded = form as HTMLFormElement & { __sourceGuard?: (event: SubmitEvent) => void };
        if (guarded.__sourceGuard) form.removeEventListener("submit", guarded.__sourceGuard);
        delete guarded.__sourceGuard;
      });
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
