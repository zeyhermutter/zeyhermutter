import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./styles.css";
import "./crm.css";

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
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
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
