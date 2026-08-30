import { useEffect } from "react";
import {
  isRouteErrorResponse,
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

    const onSubmit = async (event: SubmitEvent) => {
      if (form.dataset.geocodeReady === "1") {
        delete form.dataset.geocodeReady;
        return;
      }

      const street = form.querySelector<HTMLInputElement>('input[name="street"]')?.value.trim() ?? "";
      const houseNumber = form.querySelector<HTMLInputElement>('input[name="house_number"]')?.value.trim() ?? "";
      const postalCode = form.querySelector<HTMLInputElement>('input[name="postal_code"]')?.value.trim() ?? "";
      const city = form.querySelector<HTMLInputElement>('input[name="city"]')?.value.trim() ?? "";
      if (!street || !houseNumber || !postalCode || !city) return;

      event.preventDefault();
      const submitter = event.submitter as HTMLButtonElement | null;
      if (submitter) submitter.disabled = true;

      const latitude = form.querySelector<HTMLInputElement>('input[name="latitude"]');
      const longitude = form.querySelector<HTMLInputElement>('input[name="longitude"]');

      try {
        const response = await fetch("/api/geocode-address", {
          method: "POST",
          body: new FormData(form),
          credentials: "same-origin",
        });
        const result = await response.json() as { coordinates?: { latitude: number; longitude: number } | null };
        if (result.coordinates) {
          if (latitude) latitude.value = String(result.coordinates.latitude);
          if (longitude) longitude.value = String(result.coordinates.longitude);
        } else {
          if (latitude) latitude.value = "";
          if (longitude) longitude.value = "";
        }
      } catch {
        if (latitude) latitude.value = "";
        if (longitude) longitude.value = "";
      } finally {
        if (submitter) submitter.disabled = false;
        form.dataset.geocodeReady = "1";
        form.requestSubmit(submitter ?? undefined);
      }
    };

    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [location.key, location.pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <OwnerAddDisclosureEnhancer />
      <AddressGeocodingEnhancer />
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
