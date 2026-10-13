import { useEffect, useRef, type ReactNode } from "react";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-dashboard";
import { PropertyOverviewMap, type PropertyMapPoint } from "~/components/property-overview-map";
import { requireActiveUser, requirePermission } from "~/lib/auth.server";
import { geocodePropertyAddress } from "~/lib/geocoding.server";
import { plural, tagKurz, tagLang, uhrzeit, wochentagKurz } from "~/lib/format";
import { crmToday } from "~/lib/local-time";
import { FRIST_TAGE, VORSCHAU_TAGE, ladeMeinTag, type Eintrag } from "~/lib/mein-tag.server";
import { kategorie } from "~/lib/terminkategorien";
import type { CalendarEvent } from "~/lib/termine";
import "~/calendar.css";
import "~/property-map.css";
import "~/programm-liste.css";
import "~/mein-tag.css";

// Mein Tag -- die Startseite des Programms.
//
// Bis 12.10.2026 stand hier eine Uebersicht aus Kennzahlen und "zuletzt
// bearbeitet"-Listen, mit einer eigenen Seitenleiste aus der Anfangszeit.
// Jetzt: was heute ansteht, was liegen geblieben ist, was neu ist, welche
// Fristen laufen. Woher das kommt, steht in app/lib/mein-tag.server.ts.
// Die Karte der Objektstandorte bleibt darunter.

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const heute = crmToday();

  // Wessen Tag: meiner, der eines Kollegen oder der aller. Die Kollegen sind
  // die anderen aktiven Benutzer -- Sebastian sieht "Jochen", Jochen sieht
  // "Sebastian". Nichts ist hier nach Namen fest verdrahtet; kommt jemand
  // dazu, bekommt er einen eigenen Knopf. Eine unbekannte Kennung in der
  // Adresse faellt auf "Meins" zurueck, statt eine leere Seite zu zeigen.
  const { data: benutzer } = await supabase.from("profiles").select("user_id,display_name").eq("status", "ACTIVE").order("display_name");
  const kollegen = ((benutzer ?? []) as { user_id: string; display_name: string | null }[])
    .filter((p) => p.user_id !== userId)
    .map((p) => ({ id: p.user_id, name: (p.display_name ?? "").trim().split(/\s+/)[0] || "Kollege" }));
  const gewuenscht = url.searchParams.get("von");
  const ansicht: "meins" | "alle" | string =
    url.searchParams.get("scope") === "all" ? "alle"
    : gewuenscht && kollegen.some((k) => k.id === gewuenscht) ? gewuenscht
    : "meins";
  const scope = ansicht === "alle" ? "all" : "mine";
  const person = ansicht === "alle" || ansicht === "meins" ? userId : ansicht;

  const [tag, propertyPermission, { count: propertyCount }] = await Promise.all([
    ladeMeinTag(supabase, person, scope, heute),
    supabase.rpc("current_user_has_permission", { p_permission: "property.read" }),
    supabase.from("properties").select("id", { count: "exact", head: true }).neq("status", "ARCHIVED"),
  ]);

  let propertyMapPoints: PropertyMapPoint[] = [];
  let missingCoordinateCount = 0;
  if (propertyPermission.data === true) {
    const [{ data: addressRows }, { count: missingCount }] = await Promise.all([
      supabase.from("property_addresses").select("property_id,latitude,longitude,street,house_number,postal_code,city,district,properties!inner(id,property_number,internal_title,status,transaction_type)").not("latitude", "is", null).not("longitude", "is", null).neq("properties.status", "ARCHIVED").order("city"),
      supabase.from("property_addresses").select("id,properties!inner(status)", { count: "exact", head: true }).or("latitude.is.null,longitude.is.null").neq("properties.status", "ARCHIVED"),
    ]);
    missingCoordinateCount = missingCount ?? 0;
    propertyMapPoints = (addressRows ?? []).flatMap((row: any) => {
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      const latitude = Number(row.latitude), longitude = Number(row.longitude);
      if (!property || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{ id: property.id, propertyNumber: property.property_number, title: property.internal_title, status: property.status, transactionType: property.transaction_type, latitude, longitude, addressLabel: `${row.street} ${row.house_number}, ${row.postal_code} ${row.city}${row.district ? ` · ${row.district}` : ""}` } satisfies PropertyMapPoint];
    });
  }

  return data({
    ...tag,
    ansicht,
    kollegen,
    vorschauTage: VORSCHAU_TAGE,
    fristTage: FRIST_TAGE,
    zeigeKarte: propertyPermission.data === true,
    propertyCount: propertyCount ?? 0,
    propertyMapPoints,
    missingCoordinateCount,
  }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.write");
  const fd = await request.formData();
  if (String(fd.get("_intent") ?? "") !== "backfill_geocodes") return data({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
  const { data: addresses, error } = await supabase.from("property_addresses").select("id,version,street,house_number,postal_code,city,district,country,properties!inner(status)").or("latitude.is.null,longitude.is.null").neq("properties.status", "ARCHIVED").limit(5);
  if (error) return data({ error: "Fehlende Koordinaten konnten nicht ermittelt werden." }, { status: 400, headers: responseHeaders() });
  let geocoded = 0;
  for (const address of addresses ?? []) {
    if (!address.street || !address.house_number || !address.postal_code || !address.city) continue;
    try {
      const coordinates = await geocodePropertyAddress(supabase, { street: address.street, houseNumber: address.house_number, postalCode: address.postal_code, city: address.city, district: address.district, country: address.country }, context.cloudflare.env.APP_BASE_URL);
      if (!coordinates) continue;
      const { data: updated } = await supabase.from("property_addresses").update({ latitude: coordinates.latitude, longitude: coordinates.longitude }).eq("id", address.id).eq("version", address.version).select("id").maybeSingle();
      if (updated) geocoded += 1;
    } catch {}
  }
  return data({ geocoded }, { headers: responseHeaders() });
}

function Termin({ e, mitTag }: { e: CalendarEvent; mitTag?: boolean }) {
  const art = kategorie(e.kind);
  return (
    <Link className="mein-tag-zeile" to={e.sourcePath}>
      <span className="mein-tag-wann">
        {mitTag ? <small>{wochentagKurz(e.startsAt)}</small> : null}
        {e.ganztags ? "ganztags" : uhrzeit(e.startsAt)}
      </span>
      <span className={`termin-marke ${art.klasse}`} title={art.beschriftung} aria-hidden="true">{art.kuerzel}</span>
      <span className="mein-tag-was"><strong>{e.title}</strong><small title={e.subtitle}>{e.subtitle}</small></span>
      {e.statusLabel ? <span className="mein-tag-art">{e.statusLabel}</span> : null}
    </Link>
  );
}

function Zeile({ e, wann, warnung }: { e: Eintrag; wann: string; warnung?: boolean }) {
  return (
    <Link className={`mein-tag-zeile${warnung ? " warnung" : ""}`} to={e.pfad}>
      <span className="mein-tag-wann">{wann}</span>
      <span className="mein-tag-was"><strong>{e.titel}</strong><small title={e.kontext}>{e.kontext}</small></span>
      <span className="mein-tag-art">{e.art}</span>
    </Link>
  );
}

/** Die Farbe eines Feldes: Termine blau, Liegengebliebenes rot, Fristen
 * bernstein, Neues gruen -- so findet das Auge das drueckende Feld zuerst. */
type Ton = "termin" | "druck" | "frist" | "neu";

function Feld({ titel, anzahl, mehr, leer, ton, children }: {
  titel: string;
  ton: Ton;
  anzahl: number;
  mehr?: { pfad: string; beschriftung: string };
  leer: string;
  children: ReactNode;
}) {
  return (
    <section className={`mein-tag-feld ton-${ton}${anzahl > 0 ? " hat-eintraege" : ""}`} aria-label={titel}>
      <header className="mein-tag-feld-kopf">
        <h2>{titel}</h2>
        <span className="mein-tag-zahl">{anzahl}</span>
        {mehr ? <Link className="mein-tag-mehr" to={mehr.pfad}>{mehr.beschriftung}</Link> : null}
      </header>
      {anzahl === 0 ? <p className="mein-tag-leer">{leer}</p> : <div className="mein-tag-liste">{children}</div>}
    </section>
  );
}

export default function MeinTag() {
  const d = useLoaderData<typeof loader>();
  const geocodeFetcher = useFetcher<typeof action>();
  const backfillStarted = useRef(false);
  useEffect(() => {
    if (backfillStarted.current || d.missingCoordinateCount <= 0 || geocodeFetcher.state !== "idle") return;
    backfillStarted.current = true;
    const formData = new FormData(); formData.set("_intent", "backfill_geocodes");
    geocodeFetcher.submit(formData, { method: "post" });
  }, [d.missingCoordinateCount, geocodeFetcher]);

  const ueberfaelligeFristen = d.fristen.filter((f) => f.ueberfaellig).length;
  const fremd = d.kollegen.find((k) => k.id === d.ansicht) ?? null;
  const zusammenfassung = [
    plural(d.termineHeute.length, "Termin heute", "Termine heute"),
    `${d.liegengeblieben.length} liegen geblieben`,
    `${d.neu.length} neu`,
    plural(d.fristen.length, "Frist", "Fristen") + (ueberfaelligeFristen ? `, ${ueberfaelligeFristen} überfällig` : ""),
  ].join(" · ");

  return (
    <main className="editor-shell mein-tag">
      <div className="mein-tag-kopf">
        <div>
          <h1>{tagLang(d.heute)}{fremd ? <span className="mein-tag-wessen"> · Tag von {fremd.name}</span> : null}</h1>
          <p>{zusammenfassung}</p>
        </div>
        <nav className="programm-umfang" aria-label="Umfang">
          {[
            { schluessel: "meins", name: "Meins", pfad: "/crm" },
            ...d.kollegen.map((k) => ({ schluessel: k.id, name: k.name, pfad: `/crm?von=${encodeURIComponent(k.id)}` })),
            { schluessel: "alle", name: "Alle", pfad: "/crm?scope=all" },
          ].map((u) => (
            <Link key={u.schluessel} className={d.ansicht === u.schluessel ? "aktiv" : ""} aria-current={d.ansicht === u.schluessel ? "page" : undefined} to={u.pfad}>{u.name}</Link>
          ))}
        </nav>
      </div>

      {d.quellenfehler.length > 0 ? (
        <p className="form-warning mein-tag-hinweis">Nicht geladen: {d.quellenfehler.join(", ")}. Der Rest der Seite ist vollständig.</p>
      ) : null}

      {/* Drei Spalten: was heute ansteht (Termine), was drueckt (Ueberfaelliges,
          Fristen), was neu ist. Auf schmalen Bildschirmen untereinander, in
          dieser Reihenfolge. */}
      <div className="mein-tag-raster">
        <div className="mein-tag-spalte">
          <Feld ton="termin" titel="Termine heute" anzahl={d.termineHeute.length} mehr={{ pfad: d.ansicht === "meins" ? "/crm/calendar" : `/crm/calendar?von=${encodeURIComponent(d.ansicht)}`, beschriftung: "Kalender" }}
            leer="Heute steht kein Termin an.">
            {d.termineHeute.map((e) => <Termin key={e.key} e={e} />)}
          </Feld>
          <Feld ton="termin" titel={`Nächste ${d.vorschauTage - 1} Tage`} anzahl={d.termineDanach.length}
            leer="In den nächsten Tagen steht kein Termin an.">
            {d.termineDanach.map((e) => <Termin key={e.key} e={e} mitTag />)}
          </Feld>
        </div>

        <div className="mein-tag-spalte">
          <Feld ton="druck" titel="Liegen geblieben" anzahl={d.liegengeblieben.length} mehr={{ pfad: "/crm/tasks", beschriftung: "Aufgaben" }}
            leer="Nichts ist überfällig.">
            {d.liegengeblieben.map((e) => <Zeile key={e.key} e={e} wann={tagKurz(e.wann)} warnung />)}
          </Feld>
          <Feld ton="frist" titel={`Fristen (${d.fristTage} Tage)`} anzahl={d.fristen.length}
            leer={`Keine Frist in den nächsten ${d.fristTage} Tagen.`}>
            {d.fristen.map((e) => <Zeile key={e.key} e={e} wann={tagKurz(e.wann)} warnung={e.ueberfaellig} />)}
          </Feld>
        </div>

        <div className="mein-tag-spalte">
          <Feld ton="neu" titel="Neu eingegangen" anzahl={d.neu.length} mehr={{ pfad: "/inquiries", beschriftung: "Anfragen" }}
            leer="Keine neue Anfrage und kein neuer Lead.">
            {d.neu.map((e) => <Zeile key={e.key} e={e} wann={tagKurz(e.wann)} />)}
          </Feld>
        </div>
      </div>

      {d.zeigeKarte ? (
        <section className="data-card property-map-card mein-tag-karte">
          <div className="card-head">
            <div><h2>Objektstandorte</h2></div>
            <div><Link className="subtle-link" to="/properties?ansicht=tabelle">Alle Objekte</Link><div className="map-coverage-note">{d.propertyMapPoints.length} von {d.propertyCount} lokalisiert{geocodeFetcher.state !== "idle" ? " · Koordinaten werden ergänzt…" : ""}</div></div>
          </div>
          <PropertyOverviewMap points={d.propertyMapPoints} />
        </section>
      ) : null}
    </main>
  );
}
