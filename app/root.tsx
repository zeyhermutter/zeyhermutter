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
    form.hidden = !shouldOpen;

    const sync = () => {
      const open = !form.hidden;
      button.textContent = open ? "− Eigentümer hinzufügen schließen" : "+ Eigentümer hinzufügen";
      button.setAttribute("aria-expanded", String(open));
    };

    button.addEventListener("click", () => {
      form.hidden = !form.hidden;
      sync();
      if (!form.hidden) form.querySelector<HTMLElement>("select, input")?.focus();
    });

    form.parentElement?.insertBefore(wrapper, form);
    wrapper.appendChild(button);
    sync();

    return () => {
      wrapper.remove();
      form.hidden = false;
    };
  }, [location.key, location.pathname, location.search]);

  return null;
}

export default function App() {
  return (
    <>
      <OwnerAddDisclosureEnhancer />
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
