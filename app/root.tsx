import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import type { Route } from "./+types/root";
import { PropertyLeadOnboarding } from "~/components/property-lead-onboarding";
import "./styles.css";
import "./crm.css";
import "./property-context-nav.css";

declare const __BUILD_COMMIT__: string;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <div className="build-version" title="Git-Commit des aktuell ausgelieferten Cloudflare-Builds">Stand {__BUILD_COMMIT__}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function DateTimePickerEnhancer() {
  const location = useLocation();

  useEffect(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="date"], input[type="datetime-local"], input[type="time"]'));
    const openPicker = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
      if (input.disabled || input.readOnly || typeof input.showPicker !== "function") return;
      try { input.showPicker(); } catch { /* Browser may restrict programmatic picker opening. */ }
    };

    inputs.forEach((input) => {
      input.classList.add("app-date-picker");
      input.title = input.type === "date" ? "Datum im Kalender auswählen" : input.type === "time" ? "Uhrzeit auswählen" : "Datum und Uhrzeit auswählen";
      input.addEventListener("click", openPicker);
    });

    return () => inputs.forEach((input) => input.removeEventListener("click", openPicker));
  }, [location.key, location.pathname]);

  return null;
}

function LeadAddressQuickEntryEnhancer() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith("/leads")) return;
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
    const cleanups: Array<() => void> = [];

    for (const form of forms) {
      const street = form.querySelector<HTMLInputElement>('input[name="property_street"]');
      const houseNumber = form.querySelector<HTMLInputElement>('input[name="property_house_number"]');
      const postalCode = form.querySelector<HTMLInputElement>('input[name="property_postal_code"]');
      const city = form.querySelector<HTMLInputElement>('input[name="property_city"]');
      if (!street || !houseNumber || !postalCode || !city || form.querySelector(".lead-address-quick-entry")) continue;

      const controls: Array<[HTMLInputElement | HTMLSelectElement, string]> = [
        [street, "property-street"],
        [houseNumber, "property-house-number"],
        [postalCode, "property-postal-code"],
        [city, "property-city"],
      ];
      const propertyType = form.querySelector<HTMLSelectElement>('select[name="property_type"]');
      if (propertyType) controls.push([propertyType, "property-type"]);
      controls.forEach(([control, key]) => { if (!control.id) control.id = `lead-field-${key}`; });

      const wrapper = document.createElement("div");
      wrapper.className = "lead-address-quick-entry";
      const label = document.createElement("label");
      label.className = "form-field";
      const caption = document.createElement("span");
      caption.textContent = "Adresse (Schnelleingabe)";
      const row = document.createElement("div");
      row.className = "lead-address-quick-row";
      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "street-address";
      input.placeholder = "z. B. Landshuter Str. 33, 85356 Freising";
      input.setAttribute("aria-label", "Vollständige Adresse zur automatischen Aufteilung");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = "Adresse aufteilen";
      const note = document.createElement("small");
      note.className = "lead-address-quick-note";
      note.textContent = "Straße, Hausnummer, PLZ und Ort werden automatisch in die Felder darunter übernommen.";
      row.append(input, button);
      label.append(caption, row, note);
      wrapper.append(label);

      const streetLabel = street.closest("label");
      streetLabel?.parentElement?.insertBefore(wrapper, streetLabel);

      const split = () => {
        const raw = input.value.trim().replace(/\s+/g, " ");
        if (!raw) return false;
        const match = raw.match(/^(.+?)\s+(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)\s*,?\s+(\d{5})\s+(.+)$/);
        if (!match) {
          note.textContent = "Adresse konnte nicht sicher aufgeteilt werden. Beispiel: Landshuter Str. 33, 85356 Freising";
          note.classList.add("lead-address-quick-error");
          return false;
        }
        street.value = match[1].trim();
        houseNumber.value = match[2].trim();
        postalCode.value = match[3].trim();
        city.value = match[4].trim().replace(/^,\s*/, "");
        [street, houseNumber, postalCode, city].forEach((field) => {
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        });
        input.value = "";
        note.textContent = "Adresse erfolgreich aufgeteilt und übernommen.";
        note.classList.remove("lead-address-quick-error");
        note.classList.add("lead-address-quick-success");
        street.focus();
        return true;
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        split();
      };
      const onBlur = () => { if (input.value.includes(",") && /\b\d{5}\b/.test(input.value)) split(); };
      button.addEventListener("click", split);
      input.addEventListener("keydown", onKeyDown);
      input.addEventListener("blur", onBlur);
      cleanups.push(() => {
        button.removeEventListener("click", split);
        input.removeEventListener("keydown", onKeyDown);
        input.removeEventListener("blur", onBlur);
        wrapper.remove();
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [location.key, location.pathname]);

  return null;
}

function LeadReleaseBlockerEnhancer() {
  const location = useLocation();

  useEffect(() => {
    if (!/^\/leads\/[^/]+\/?$/.test(location.pathname)) return;
    const coreForm = Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => form.querySelector('input[name="_intent"][value="core"]'));
    const readiness = document.querySelector<HTMLElement>(".lead-conversion-readiness");
    if (!coreForm) return;

    const propertyType = coreForm.querySelector<HTMLSelectElement>('select[name="property_type"]');
    const street = coreForm.querySelector<HTMLInputElement>('input[name="property_street"]');
    const houseNumber = coreForm.querySelector<HTMLInputElement>('input[name="property_house_number"]');
    const postalCode = coreForm.querySelector<HTMLInputElement>('input[name="property_postal_code"]');
    const city = coreForm.querySelector<HTMLInputElement>('input[name="property_city"]');
    const fieldDefs = [
      { control: propertyType, key: "property-type", label: "Immobilientyp auswählen" },
      { control: street, key: "property-street", label: "Straße ergänzen" },
      { control: houseNumber, key: "property-house-number", label: "Hausnummer ergänzen" },
      { control: postalCode, key: "property-postal-code", label: "PLZ ergänzen" },
      { control: city, key: "property-city", label: "Ort ergänzen" },
    ];
    fieldDefs.forEach(({ control, key }) => { if (control && !control.id) control.id = `lead-field-${key}`; });

    const blockers: typeof fieldDefs = [];
    if (propertyType && !propertyType.value) blockers.push(fieldDefs[0]);
    const addressControls = [street, houseNumber, postalCode, city];
    const anyAddress = addressControls.some((control) => Boolean(control?.value.trim()));
    if (anyAddress) {
      fieldDefs.slice(1).forEach((item) => { if (item.control && !item.control.value.trim()) blockers.push(item); });
    }

    blockers.forEach(({ control }) => control?.closest("label")?.classList.add("lead-release-blocker"));

    if (readiness) {
      const existingPermission = Array.from(readiness.querySelectorAll("li")).some((item) => item.textContent?.includes("Berechtigung"));
      let list = readiness.querySelector("ul");
      if (!list) {
        list = document.createElement("ul");
        readiness.appendChild(list);
      }
      list.innerHTML = "";
      blockers.forEach(({ control, label }) => {
        if (!control) return;
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lead-blocker-link";
        button.textContent = label;
        button.addEventListener("click", () => {
          control.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(() => control.focus(), 250);
        });
        item.appendChild(button);
        list?.appendChild(item);
      });
      if (existingPermission) {
        const item = document.createElement("li");
        item.textContent = "Berechtigung für Lead-/Immobilienübernahme";
        list.appendChild(item);
      }
    }

    return () => blockers.forEach(({ control }) => control?.closest("label")?.classList.remove("lead-release-blocker"));
  }, [location.key, location.pathname]);

  return null;
}

function OwnerAddDisclosureEnhancer() {
  const location = useLocation();

  useEffect(() => {
    const section = document.getElementById("eigentuemer");
    const form = section?.querySelector<HTMLFormElement>("form.auth-form.compact-form");
    if (!section || !form || section.querySelector(".owner-add-toggle")) return;

    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "18px";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button owner-add-toggle";

    const shouldOpen = new URLSearchParams(location.search).has("newOwner");
    let open = shouldOpen;

    const sync = () => {
      form.style.display = open ? "" : "none";
      button.textContent = open ? "− Eigentümer hinzufügen schließen" : "+ Eigentümer hinzufügen";
      button.setAttribute("aria-expanded", String(open));
    };

    button.addEventListener("click", () => {
      open = !open;
      sync();
      if (open) form.querySelector<HTMLElement>("select, input")?.focus();
    });

    form.parentElement?.insertBefore(wrapper, form);
    wrapper.appendChild(button);
    sync();

    return () => {
      wrapper.remove();
      form.style.display = "";
    };
  }, [location.key, location.pathname, location.search]);

  return null;
}

function AddressGeocodingEnhancer() {
  const location = useLocation();

  useEffect(() => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
    const form = forms.find((candidate) => candidate.querySelector<HTMLInputElement>('input[name="_intent"][value="address"]'));
    if (!form) return;

    const street = form.querySelector<HTMLInputElement>('input[name="street"]');
    const houseNumber = form.querySelector<HTMLInputElement>('input[name="house_number"]');
    const postalCode = form.querySelector<HTMLInputElement>('input[name="postal_code"]');
    const city = form.querySelector<HTMLInputElement>('input[name="city"]');
    const country = form.querySelector<HTMLInputElement>('input[name="country"]');
    const latitude = form.querySelector<HTMLInputElement>('input[name="latitude"]');
    const longitude = form.querySelector<HTMLInputElement>('input[name="longitude"]');
    if (!street || !houseNumber || !postalCode || !city || !latitude || !longitude) return;

    latitude.readOnly = true;
    longitude.readOnly = true;
    latitude.setAttribute("aria-readonly", "true");
    longitude.setAttribute("aria-readonly", "true");
    latitude.title = "Wird automatisch über OpenStreetMap/Nominatim ermittelt";
    longitude.title = "Wird automatisch über OpenStreetMap/Nominatim ermittelt";

    const latLabel = latitude.closest("label")?.querySelector("span");
    const lonLabel = longitude.closest("label")?.querySelector("span");
    if (latLabel) latLabel.textContent = "Breitengrad (automatisch)";
    if (lonLabel) lonLabel.textContent = "Längengrad (automatisch)";

    const note = document.createElement("small");
    note.className = "coordinate-auto-note";
    longitude.closest("label")?.insertAdjacentElement("afterend", note);

    const addressInputs = [street, houseNumber, postalCode, city, country].filter(Boolean) as HTMLInputElement[];
    let lastGeocodedSignature = latitude.value && longitude.value ? currentSignature() : "";
    let running: Promise<boolean> | null = null;

    function currentSignature() {
      return [street.value.trim(), houseNumber.value.trim(), postalCode.value.trim(), city.value.trim(), (country?.value.trim() || "DE").toUpperCase()].join("|");
    }

    function isComplete() {
      return Boolean(street.value.trim() && houseNumber.value.trim() && postalCode.value.trim() && city.value.trim());
    }

    function updateNote(message?: string) {
      if (message) {
        note.textContent = message;
        return;
      }
      if (latitude.value && longitude.value) {
        note.textContent = `Automatisch ermittelt: ${latitude.value} / ${longitude.value}`;
      } else {
        note.textContent = "Koordinaten werden aus Straße, Hausnummer, PLZ und Ort automatisch ermittelt.";
      }
    }

    async function geocode(force = false) {
      if (!isComplete()) {
        latitude.value = "";
        longitude.value = "";
        lastGeocodedSignature = "";
        updateNote();
        return false;
      }

      const signature = currentSignature();
      if (!force && signature === lastGeocodedSignature && latitude.value && longitude.value) {
        updateNote();
        return true;
      }
      if (running) return running;

      running = (async () => {
        updateNote("Koordinaten werden über OpenStreetMap ermittelt …");
        try {
          const response = await fetch("/api/geocode-address", {
            method: "POST",
            body: new FormData(form),
            credentials: "same-origin",
          });
          const result = await response.json() as { coordinates?: { latitude: number; longitude: number } | null };
          if (!result.coordinates) {
            latitude.value = "";
            longitude.value = "";
            lastGeocodedSignature = "";
            updateNote("Für diese Adresse konnten keine eindeutigen Koordinaten ermittelt werden.");
            return false;
          }

          latitude.value = String(result.coordinates.latitude);
          longitude.value = String(result.coordinates.longitude);
          lastGeocodedSignature = signature;
          updateNote();
          return true;
        } catch {
          latitude.value = "";
          longitude.value = "";
          lastGeocodedSignature = "";
          updateNote("Koordinaten konnten aktuell nicht ermittelt werden. Die Adresse kann trotzdem gespeichert werden.");
          return false;
        } finally {
          running = null;
        }
      })();

      return running;
    }

    const handleAddressChange = () => {
      if (currentSignature() === lastGeocodedSignature) return;
      latitude.value = "";
      longitude.value = "";
      updateNote();
      void geocode();
    };

    const onSubmit = async (event: SubmitEvent) => {
      if (form.dataset.geocodeReady === "1") {
        delete form.dataset.geocodeReady;
        return;
      }
      if (!isComplete()) return;

      const signature = currentSignature();
      if (signature === lastGeocodedSignature && latitude.value && longitude.value) return;

      event.preventDefault();
      const submitter = event.submitter as HTMLButtonElement | null;
      if (submitter) submitter.disabled = true;
      await geocode(true);
      if (submitter) submitter.disabled = false;
      form.dataset.geocodeReady = "1";
      form.requestSubmit(submitter ?? undefined);
    };

    addressInputs.forEach((input) => input.addEventListener("change", handleAddressChange));
    form.addEventListener("submit", onSubmit);
    updateNote();
    if (!latitude.value || !longitude.value) void geocode();

    return () => {
      addressInputs.forEach((input) => input.removeEventListener("change", handleAddressChange));
      form.removeEventListener("submit", onSubmit);
      note.remove();
    };
  }, [location.key, location.pathname]);

  return null;
}

function PropertyContextNavigation() {
  const location = useLocation();
  const match = location.pathname.match(/^\/properties\/([^/]+)(?:\/(documents|media))?\/?$/);
  if (!match) return null;

  const propertyId = match[1];
  const section = match[2] ?? "record";
  return (
    <nav className="property-context-nav" aria-label="Immobilienakte">
      <Link className={section === "record" ? "active" : ""} to={`/properties/${propertyId}`}>Objektakte</Link>
      <Link className={section === "documents" ? "active" : ""} to={`/properties/${propertyId}/documents`}>Dokumente</Link>
      <Link className={section === "media" ? "active" : ""} to={`/properties/${propertyId}/media`}>Medien</Link>
    </nav>
  );
}

export default function App() {
  return (
    <>
      <DateTimePickerEnhancer />
      <LeadAddressQuickEntryEnhancer />
      <LeadReleaseBlockerEnhancer />
      <OwnerAddDisclosureEnhancer />
      <AddressGeocodingEnhancer />
      <PropertyContextNavigation />
      <PropertyLeadOnboarding />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="error-shell">
      <section className="panel">
        <p className="eyebrow">ZeyherMutterOS</p>
        <h1>{notFound ? "Seite nicht gefunden" : "Ein Fehler ist aufgetreten"}</h1>
        <p>{notFound ? "Die angeforderte Seite existiert nicht." : "Die Anfrage konnte nicht verarbeitet werden."}</p>
      </section>
    </main>
  );
}
