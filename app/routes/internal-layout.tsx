import { Link, Outlet, useLocation } from "react-router";
import { LiveListFilters } from "~/components/live-list-filters";
import { PersistentNavigation } from "~/components/persistent-navigation";

function PropertyContextNavigation() {
  const location = useLocation();
  const match = location.pathname.match(/^\/properties\/([^/]+)(?:\/(documents|media|interests|publication|exposes))?(?:\/preview)?\/?$/);
  if (!match) return null;

  const propertyId = match[1];
  const section = match[2] ?? "record";
  return (
    <nav className="property-context-nav persistent-property-context-nav" aria-label="Immobilienakte">
      <Link className={section === "record" ? "active" : ""} to={`/properties/${propertyId}`}>Objektakte</Link>
      <Link className={section === "interests" ? "active" : ""} to={`/properties/${propertyId}/interests`}>Interessenten & Besichtigungen</Link>
      <Link className={section === "publication" ? "active" : ""} to={`/properties/${propertyId}/publication`}>Vermarktung</Link>
      <Link className={section === "exposes" ? "active" : ""} to={`/properties/${propertyId}/exposes`}>Exposés</Link>
      <Link className={section === "documents" ? "active" : ""} to={`/properties/${propertyId}/documents`}>Dokumente</Link>
      <Link className={section === "media" ? "active" : ""} to={`/properties/${propertyId}/media`}>Medien</Link>
    </nav>
  );
}

export default function InternalLayout() {
  return (
    <div className="persistent-app-frame">
      <PersistentNavigation />
      <div className="persistent-app-main">
        <LiveListFilters />
        <PropertyContextNavigation />
        <Outlet />
      </div>
    </div>
  );
}
