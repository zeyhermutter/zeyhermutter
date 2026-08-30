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
      <OwnerAddDisclosureEnhancer />
      <AddressGeocodingEnhancer />
      <PropertyContextNavigation />
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
